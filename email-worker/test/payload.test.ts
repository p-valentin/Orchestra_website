// Parsing tests for the Email Worker.
//
// This Worker cannot be exercised end to end from here — Cloudflare credentials
// are not available in this environment and the mail route is live — so the two
// things that would silently break in production are pinned here instead:
//
//   1. what postal-mime actually returns for real MIME, and how that becomes
//      the ingest payload;
//   2. that the signature this Worker mints is byte-identical to the one the
//      Supabase function verifies. If those drift, mail simply stops appearing
//      in /admin with nothing in the logs but a 404, so the check imports the
//      SERVER's implementation and compares rather than restating it.
//
// Run: deno test --allow-read --allow-net test/   (from email-worker/)

import { assert, assertEquals } from 'jsr:@std/assert@1'
import PostalMime from 'postal-mime'
import { buildIngestPayload, type ParsedEmail, signRequest } from '../src/payload.ts'
import { signAdminRequest } from '../../supabase/functions/_shared/admin-auth.ts'

function mime(lines: string[]): Uint8Array {
  return new TextEncoder().encode(lines.join('\r\n'))
}

async function parse(raw: Uint8Array): Promise<ParsedEmail> {
  return (await new PostalMime().parse(raw)) as ParsedEmail
}

const MULTIPART = mime([
  'From: Jane Customer <jane@example.com>',
  'To: Orchestra <hello@orchestra-automation.com>',
  'Subject: =?utf-8?Q?Licence_won=27t_activate?=',
  'Message-ID: <abc123@mail.example.com>',
  'In-Reply-To: <prev999@orchestra-automation.com>',
  'References: <first@x.com> <prev999@orchestra-automation.com>',
  'MIME-Version: 1.0',
  'Content-Type: multipart/alternative; boundary="bnd"',
  '',
  '--bnd',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Hi — the licence key you sent bounces with "invalid".',
  '',
  '--bnd',
  'Content-Type: text/html; charset=utf-8',
  '',
  '<p>Hi &mdash; the licence key you sent bounces with "invalid".</p>',
  '',
  '--bnd--',
  '',
])

Deno.test('w1. a real multipart message becomes the payload the endpoint expects', async () => {
  const payload = buildIngestPayload({
    envelopeFrom: 'jane@example.com',
    envelopeTo: 'hello@orchestra-automation.com',
    authResults: 'mx.cloudflare.net; spf=pass; dkim=pass; dmarc=pass',
    parsed: await parse(MULTIPART),
  })

  // RFC 2047 encoded-words are decoded by the parser, not left as =?utf-8?Q?.
  assertEquals(payload.subject, "Licence won't activate")
  assertEquals(payload.message_id, '<abc123@mail.example.com>')
  assertEquals(payload.in_reply_to, '<prev999@orchestra-automation.com>')
  assertEquals(payload.references, ['<first@x.com>', '<prev999@orchestra-automation.com>'])

  // Both parts survive: the endpoint stores text and sanitises html.
  assert(payload.text.includes('bounces with "invalid"'), `text was: ${payload.text}`)
  assert(payload.html.includes('<p>'), `html was: ${payload.html}`)

  // The envelope (what Cloudflare routed on) and the header (what the sender
  // claimed) are carried separately, never merged.
  assertEquals(payload.envelope_from, 'jane@example.com')
  assertEquals(payload.from, 'Jane Customer <jane@example.com>')
  assertEquals(payload.auth_results, 'mx.cloudflare.net; spf=pass; dkim=pass; dmarc=pass')
})

Deno.test('w2. an html-only message still yields html for the endpoint to sanitise', async () => {
  const raw = mime([
    'From: bob@example.com',
    'To: hello@orchestra-automation.com',
    'Subject: Re: Re: Fwd: refund?',
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    '<html><body><b>can I get a refund</b><script>alert(1)</script></body></html>',
    '',
  ])
  const payload = buildIngestPayload({
    envelopeFrom: 'bob@example.com',
    envelopeTo: 'hello@orchestra-automation.com',
    authResults: null,
    parsed: await parse(raw),
  })
  assert(payload.html.includes('can I get a refund'))
  // The Worker forwards markup as-is. Removing the script is the ENDPOINT's
  // job — asserted in the ingest tests — and doing it in two places would mean
  // two implementations to keep correct.
  assert(payload.html.includes('<script>'), 'the Worker is a courier, not a sanitiser')
  assertEquals(payload.message_id, null)
})

Deno.test('w3. attachments are reduced to name/size/type — never the bytes', async () => {
  const raw = mime([
    'From: carol@example.com',
    'To: hello@orchestra-automation.com',
    'Subject: screenshot',
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="b2"',
    '',
    '--b2',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'see attached',
    '',
    '--b2',
    'Content-Type: image/png; name="shot.png"',
    'Content-Disposition: attachment; filename="shot.png"',
    'Content-Transfer-Encoding: base64',
    '',
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    '',
    '--b2--',
    '',
  ])
  const payload = buildIngestPayload({
    envelopeFrom: 'carol@example.com',
    envelopeTo: 'hello@orchestra-automation.com',
    authResults: null,
    parsed: await parse(raw),
  })

  assertEquals(payload.attachments.length, 1)
  assertEquals(payload.attachments[0].name, 'shot.png')
  assertEquals(payload.attachments[0].type, 'image/png')
  assert(payload.attachments[0].size > 0, 'the size is reported')
  assert(
    !JSON.stringify(payload).includes('iVBORw0KGgo'),
    'attachment bytes must never reach the payload',
  )
})

Deno.test('w4. a message with no usable sender still produces a payload the endpoint can reject', async () => {
  // Truncated mid-header: postal-mime returns something, and the Worker must
  // not throw on it. Deciding it is unusable is the endpoint's job.
  const raw = new TextEncoder().encode('From: \r\nSubject: \r\n\r\n')
  const payload = buildIngestPayload({
    envelopeFrom: '',
    envelopeTo: '',
    authResults: null,
    parsed: await parse(raw),
  })
  assertEquals(payload.envelope_from, '')
  assertEquals(payload.subject, '')
})

Deno.test('w5. the Worker signs exactly what the Supabase function verifies', async () => {
  // The whole point: two implementations of one scheme, in two languages'
  // worth of distance from each other. Compared directly rather than described.
  const secret = 'x'.repeat(48)
  const body = JSON.stringify({ subject: 'hello', text: 'world' })
  const ts = 1_785_000_000
  const url = 'https://jxcxtwmqwontjttywxlt.supabase.co/functions/v1/mail-ingest'

  const worker = await signRequest(secret, 'POST', url, body, ts)
  const server = await signAdminRequest(secret, 'POST', new URL(url).pathname, body, ts)

  assertEquals(worker['x-orchestra-sig'], server['x-orchestra-sig'])
  assertEquals(worker['x-orchestra-ts'], server['x-orchestra-ts'])
})
