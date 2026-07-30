// _shared/mail.ts — the code that handles strings a stranger wrote.
//
// The sanitiser gets most of the attention because it is the piece whose
// failure mode is worst: its output is stored on the row that the /admin page
// reads, and /admin is where the customer list lives. The page renders the TEXT
// part rather than this html, so a hole here is not by itself an XSS — but the
// tests are written as though it were, because the second barrier is the one
// you are allowed to assume nothing about.

import { assert, assertEquals } from 'jsr:@std/assert@1'
import {
  dedupeHash,
  htmlToText,
  MAX_BODY_TEXT,
  normaliseEmail,
  normaliseInbound,
  normaliseSubject,
  replySubject,
  sanitiseHtml,
  threadTitle,
} from '../../functions/_shared/mail.ts'

// ---------- addresses ----------

Deno.test('m1. an address is re-derived from the header, never taken as written', () => {
  assertEquals(normaliseEmail('Jane Customer <jane@example.com>'), 'jane@example.com')
  assertEquals(normaliseEmail('JANE@EXAMPLE.COM'), 'jane@example.com')
  assertEquals(normaliseEmail('  jane@example.com  '), 'jane@example.com')
  assertEquals(normaliseEmail('mailto:jane@example.com'), 'jane@example.com')

  // The display part is free text and has been a phishing surface forever: the
  // address in angle brackets is the one that routes, so it is the one taken.
  assertEquals(
    normaliseEmail('"hello@orchestra-automation.com" <attacker@evil.test>'),
    'attacker@evil.test',
  )
})

Deno.test('m2. header injection through an address is not possible', () => {
  // A CRLF in a header value is how one header becomes two. Control characters
  // are stripped before anything else looks at the value, so the result is not
  // address-shaped and is rejected outright rather than half-accepted.
  assertEquals(normaliseEmail('jane@example.com\r\nBcc: victim@example.com'), '')
  assertEquals(normaliseEmail('jane@example.com\nSubject: forged'), '')
  assertEquals(normaliseEmail('not an address'), '')
  assertEquals(normaliseEmail('a@b'), '', 'no TLD is not an address')
  assertEquals(normaliseEmail(`${'a'.repeat(300)}@example.com`), '', 'over 254 chars')
  assertEquals(normaliseEmail(null), '')
  assertEquals(normaliseEmail(12345), '')
})

// ---------- subjects ----------

Deno.test('m3. reply prefixes collapse so a conversation stays one thread', () => {
  assertEquals(normaliseSubject('Licence not working'), 'licence not working')
  assertEquals(normaliseSubject('Re: Licence not working'), 'licence not working')
  assertEquals(normaliseSubject('RE: Fwd: Re: Licence   Not Working  '), 'licence not working')
  assertEquals(normaliseSubject('Re[2]: Licence not working'), 'licence not working')
  // German and Swedish clients, which turn up in real support mail.
  assertEquals(normaliseSubject('AW: Lizenz'), 'lizenz')
  assertEquals(normaliseSubject('SV: licens'), 'licens')

  // An empty or prefix-only subject gets a stable key rather than colliding
  // with every other empty subject — the participant is part of the key, so
  // this stays per-person.
  assertEquals(normaliseSubject(''), '(no subject)')
  assertEquals(normaliseSubject('Re:'), '(no subject)')
})

Deno.test('m3b. a thread is titled without the reply prefix its last message carried', () => {
  // The thread's displayed subject follows the newest message, so without this
  // a conversation ends up titled "Re: Refund — bought twice by mistake" purely
  // because the last thing in it was a reply. A prefix is a mail client's
  // bookkeeping, not a rename. Capitalisation is kept — unlike the thread KEY,
  // this one is read by a person.
  assertEquals(threadTitle('Re: Refund — bought twice'), 'Refund — bought twice')
  assertEquals(threadTitle('RE: Fwd: Re: Licence Not Working'), 'Licence Not Working')
  assertEquals(threadTitle('Refund — bought twice'), 'Refund — bought twice')
  assertEquals(threadTitle('Re:'), '(no subject)')
})

Deno.test('m4. a reply carries exactly one Re:', () => {
  assertEquals(replySubject('Licence not working'), 'Re: Licence not working')
  assertEquals(replySubject('Re: Licence not working'), 'Re: Licence not working')
  assertEquals(replySubject('Re: Fwd: Re: Licence not working'), 'Re: Licence not working')
  assertEquals(replySubject(''), 'Re: (no subject)')
})

// ---------- html ----------

// Every one of these must hold for the OUTPUT, not merely for the input:
// the sanitiser rebuilds markup rather than filtering it, so the assertion is
// "the dangerous construct is absent from what we stored".
function assertInert(html: string, label: string) {
  const lower = html.toLowerCase()
  for (const needle of ['<script', '<style', '<iframe', '<object', '<embed', '<svg', '<img', '<form', '<link', '<base']) {
    assert(!lower.includes(needle), `${label}: ${needle} survived — ${html}`)
  }
  assert(!/\son[a-z]+\s*=/.test(lower), `${label}: an event handler survived — ${html}`)
  assert(!lower.includes('javascript:'), `${label}: a javascript: URL survived — ${html}`)
  assert(!lower.includes('data:text/html'), `${label}: a data: document URL survived — ${html}`)
}

Deno.test('m5. script, style and friends are removed with their contents', () => {
  const out = sanitiseHtml(
    '<p>before</p><script>alert(1)</script><style>body{display:none}</style>' +
      '<iframe src="https://evil.test"></iframe><p>after</p>',
  )
  assertInert(out, 'm5')
  assert(out.includes('before') && out.includes('after'), 'the real text survives')
  assert(!out.includes('alert(1)'), 'script CONTENT is discarded, not just the tag')
  assert(!out.includes('display:none'), 'style CONTENT is discarded too')
})

Deno.test('m6. event handlers and inline styles cannot survive on an allowed tag', () => {
  const out = sanitiseHtml(
    '<div onclick="steal()" onmouseover=alert(1) style="position:fixed;inset:0">hi</div>' +
      '<p ONLOAD="x" class="admin-panel">there</p>',
  )
  assertInert(out, 'm6')
  assertEquals(out, '<div>hi</div><p>there</p>')
})

Deno.test('m7. only http, https and mailto links keep their href', () => {
  const cases: [string, boolean][] = [
    ['<a href="https://example.com">x</a>', true],
    ['<a href="http://example.com">x</a>', true],
    ['<a href="mailto:jane@example.com">x</a>', true],
    ['<a href="javascript:alert(1)">x</a>', false],
    ['<a href="JaVaScRiPt:alert(1)">x</a>', false],
    // The classic: browsers used to strip these before resolving the scheme.
    ['<a href="java\tscript:alert(1)">x</a>', false],
    ['<a href="java\nscript:alert(1)">x</a>', false],
    ['<a href="data:text/html,<script>alert(1)</script>">x</a>', false],
    ['<a href="vbscript:msgbox(1)">x</a>', false],
    ['<a href="file:///etc/passwd">x</a>', false],
    // Protocol-relative: inherits the admin page's https and reaches out.
    ['<a href="//evil.test/steal">x</a>', false],
    // Relative: would resolve against /admin.
    ['<a href="/admin?tab=purchases">x</a>', false],
  ]
  for (const [input, keepsHref] of cases) {
    const out = sanitiseHtml(input)
    assertInert(out, `m7 ${input}`)
    assertEquals(out.includes('href='), keepsHref, `wrong href handling for ${input} — got ${out}`)
    assert(out.includes('rel="noopener noreferrer nofollow ugc"'), `rel is asserted for ${input}`)
    assert(!out.includes('target'), `target is never carried through — ${out}`)
  }
})

Deno.test('m7b. an entity-encoded scheme is decoded before it is judged', () => {
  // A browser decodes attribute values before resolving them, so
  // href="javascript&#58;alert(1)" IS a javascript: URL downstream. Checking
  // the undecoded string would wave it straight through.
  for (
    const input of [
      '<a href="javascript&#58;alert(1)">x</a>',
      '<a href="javascript&#x3a;alert(1)">x</a>',
      '<a href="&#106;avascript:alert(1)">x</a>',
    ]
  ) {
    const out = sanitiseHtml(input)
    assertInert(out, `m7b ${input}`)
    assert(!out.includes('href='), `scheme survived encoding: ${input} -> ${out}`)
  }
})

Deno.test('m7c. entities in text survive as the characters they mean', () => {
  // Storing the literal string "&mdash;" instead of an em dash would make every
  // html email read as though it had been mangled — which it would have been.
  assertEquals(htmlToText(sanitiseHtml('<p>Thanks &mdash; Jane</p>')), 'Thanks — Jane')
  assertEquals(htmlToText(sanitiseHtml('<p>Tom &amp; Jerry</p>')), 'Tom & Jerry')
  assertEquals(htmlToText(sanitiseHtml('<p>a&nbsp;b</p>')), 'a b')
  // Decoded exactly once, the way a browser does: this is text, not markup.
  assertInert(sanitiseHtml('<p>&amp;lt;script&amp;gt;</p>'), 'm7c double-encoded')
})

Deno.test('m8. target and rel are replaced rather than copied', () => {
  const out = sanitiseHtml('<a href="https://x.test" target="_blank" rel="opener">go</a>')
  assertEquals(out, '<a href="https://x.test" rel="noopener noreferrer nofollow ugc">go</a>')
})

Deno.test('m9. images are dropped entirely — a remote one is a read receipt', () => {
  const out = sanitiseHtml(
    '<p>hi</p><img src="https://tracker.test/pixel.gif?who=admin"><img src=x onerror=alert(1)>',
  )
  assertInert(out, 'm9')
  assert(!out.includes('tracker.test'), 'no request is made on the admin\'s behalf')
  assertEquals(out, '<p>hi</p>')
})

Deno.test('m10. text is escaped, so nothing can be smuggled through it', () => {
  assertEquals(sanitiseHtml('a & b < c > d "e" \'f\''), 'a &amp; b &lt; c &gt; d &quot;e&quot; &#39;f&#39;')
  // A stray < that is not a tag must not become one downstream.
  assertEquals(sanitiseHtml('<p>5 < 6 and 7 > 6</p>'), '<p>5 &lt; 6 and 7 &gt; 6</p>')
  assertInert(sanitiseHtml('<<script>alert(1)</script>'), 'm10 double-bracket')
  assertInert(sanitiseHtml('<scr<script>ipt>alert(1)</script>'), 'm10 nested-name')
  assertInert(sanitiseHtml('<SCRIPT>alert(1)</SCRIPT>'), 'm10 uppercase')
  assertInert(sanitiseHtml('<script >alert(1)</script >'), 'm10 spaced')
})

Deno.test('m11. comments and doctypes are dropped whole', () => {
  // Conditional comments are how Outlook mail hides markup from other clients,
  // and how a payload hides from a parser that skips comments less carefully.
  const out = sanitiseHtml(
    '<!doctype html><!--[if mso]><script>alert(1)</script><![endif]--><p>real</p><!-- <img src=x> -->',
  )
  assertInert(out, 'm11')
  assertEquals(out, '<p>real</p>')
})

Deno.test('m12. unknown elements lose their tag but keep their words', () => {
  // A mail client quirk is far more likely than an attack, and eating the text
  // inside would lose the message.
  assertEquals(sanitiseHtml('<o:p>from Word</o:p>'), 'from Word')
  assertEquals(sanitiseHtml('<custom-element>text</custom-element>'), 'text')
})

Deno.test('m13. an unterminated tag cannot swallow the rest of the message', () => {
  const out = sanitiseHtml('<p>start</p><div attr="never closed')
  assertInert(out, 'm13')
  assert(out.includes('start'))
})

Deno.test('m14. the sanitised html is capped', () => {
  const huge = '<p>' + 'x'.repeat(400_000) + '</p>'
  const out = sanitiseHtml(huge)
  assert(out.length <= 192 * 1024 + 16, `expected a capped result, got ${out.length}`)
})

Deno.test('m15. an html-only message still yields readable text', () => {
  const html = sanitiseHtml(
    '<p>Hello there,</p><p>My licence <b>will not</b> activate.</p>' +
      '<ul><li>bought yesterday</li><li>windows 11</li></ul><p>Thanks &mdash; Jane</p>',
  )
  const text = htmlToText(html)
  assert(text.includes('Hello there,'))
  assert(text.includes('will not'))
  assert(text.includes('• bought yesterday'))
  assert(text.includes('Thanks — Jane'), `entities decode: ${text}`)
  assert(!text.includes('<'), `no markup reaches the text part: ${text}`)
})

Deno.test('m16. numeric entities cannot smuggle control characters back in', () => {
  const text = htmlToText(sanitiseHtml('<p>a&#0;b&#x0A;c&#60;script&#62;</p>'))
  assert(!text.includes(' '), 'NUL is not reintroduced')
  // &#60; decodes to a literal '<' in the TEXT, which is fine — the text part
  // is rendered as text. What matters is that it is not markup in the html.
  assertInert(sanitiseHtml('<p>a&#0;b&#x0A;c&#60;script&#62;</p>'), 'm16')
})

// ---------- the whole payload ----------

const BASE = {
  envelope_from: 'jane@example.com',
  envelope_to: 'hello@orchestra-automation.com',
  from: 'Jane <jane@example.com>',
  subject: 'Re: Licence not working',
  text: 'It still will not activate.',
}

Deno.test('m17. a normal message normalises to exactly the row we store', async () => {
  const m = await normaliseInbound({ ...BASE, message_id: '<abc@x.test>' })
  assert(m)
  assertEquals(m!.from_email, 'jane@example.com')
  assertEquals(m!.from_header, 'Jane <jane@example.com>')
  assertEquals(m!.subject, 'Re: Licence not working')
  assertEquals(m!.subject_key, 'licence not working')
  assertEquals(m!.body_text, 'It still will not activate.')
  assertEquals(m!.body_html, null)
  assertEquals(m!.truncated, false)
  assertEquals(m!.attachments, [])
})

Deno.test('m18. a message with no usable sender or no body is refused', async () => {
  assertEquals(await normaliseInbound({ ...BASE, envelope_from: '', from: 'nonsense' }), null)
  assertEquals(await normaliseInbound({ ...BASE, envelope_to: '', to: '' }), null)
  assertEquals(await normaliseInbound({ ...BASE, text: '', html: '' }), null)
  assertEquals(await normaliseInbound({}), null)
})

Deno.test('m19. an oversized body is truncated and says so', async () => {
  const m = await normaliseInbound({ ...BASE, text: 'x'.repeat(MAX_BODY_TEXT + 5000) })
  assert(m)
  assertEquals(m!.body_text.length, MAX_BODY_TEXT)
  assertEquals(m!.truncated, true, 'a half-read complaint must not look like the whole of it')
})

Deno.test('m20. attachments are reduced to metadata and capped', async () => {
  const m = await normaliseInbound({
    ...BASE,
    attachments: Array.from({ length: 50 }, (_, i) => ({
      name: `file${i}.png`,
      size: 1000,
      type: 'image/png',
      // A producer that tried to send bytes gets them ignored, not stored.
      content: 'AAAA'.repeat(1000),
    })),
  })
  assert(m)
  assertEquals(m!.attachments.length, 20)
  assertEquals(m!.attachments[0], { name: 'file0.png', size: 1000, type: 'image/png' })
  assert(!JSON.stringify(m!.attachments).includes('AAAA'), 'bytes are never carried')
})

Deno.test('m21. the dedupe hash is stable on Message-ID and falls back to content', async () => {
  const withId = await dedupeHash({ messageId: '<a@b>', from: 'x', to: 'y', subject: 's', body: 'b' })
  const sameId = await dedupeHash({ messageId: '<a@b>', from: 'q', to: 'r', subject: 't', body: 'u' })
  assertEquals(withId, sameId, 'a Message-ID identifies the message on its own')

  const noId = await dedupeHash({ from: 'x', to: 'y', subject: 's', body: 'b' })
  const noIdSame = await dedupeHash({ from: 'x', to: 'y', subject: 's', body: 'b' })
  const noIdOther = await dedupeHash({ from: 'x', to: 'y', subject: 's', body: 'different' })
  assertEquals(noId, noIdSame)
  assert(noId !== noIdOther)
  assert(noId !== withId)

  // Field boundaries cannot be shifted to forge a collision: the parts are
  // joined on a byte that cannot appear in any of them.
  const a = await dedupeHash({ from: 'ab', to: '', subject: '', body: '' })
  const b = await dedupeHash({ from: 'a', to: 'b', subject: '', body: '' })
  assert(a !== b, 'concatenation is unambiguous')
})
