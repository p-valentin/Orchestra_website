// admin-data is the most attractive endpoint in the system to an outsider: it
// returns buyer emails, order history and the sentences customers wrote when
// they asked for their money back. It is also PUBLIC (verify_jwt = false),
// because the caller is the website's server rather than a Supabase user.
//
// So its entire defence is the signature, and these tests attack it: unsigned,
// wrongly signed, stale, replayed onto another path, body swapped after
// signing. Every one of those must be indistinguishable from "no such
// endpoint" — a prober should not even learn it exists.

import { assert, assertEquals } from 'jsr:@std/assert@1'
import { signAdminRequest } from '../../functions/_shared/admin-auth.ts'
import {
  adminClient,
  createTestUser,
  deleteTestUser,
  loadTestKeys,
  postPolarWebhook,
  requireStack,
  signPolarWebhook,
  SUPABASE_URL,
  uniqueEmail,
} from '../helpers.ts'

requireStack()
const admin = adminClient()
const { adminDataSecret, polarWebhookSecret } = await loadTestKeys()

const PATH = '/functions/v1/admin-data'
const URL_ = `${SUPABASE_URL}${PATH}`

async function call(
  payload: unknown,
  opts: { secret?: string; ts?: number; path?: string; bodyOverride?: string; method?: string } = {},
) {
  const body = JSON.stringify(payload)
  const headers = await signAdminRequest(
    opts.secret ?? adminDataSecret,
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
  return { status: res.status, body: parsed as Record<string, unknown> }
}

Deno.test('70a. a correctly signed request works', async () => {
  const res = await call({ view: 'purchases', limit: 5 })
  assertEquals(res.status, 200)
  assertEquals(res.body.view, 'purchases')
  assert(Array.isArray(res.body.rows))
})

Deno.test('71a. every unauthenticated shape is a 404, not a 401', async () => {
  const body = JSON.stringify({ view: 'purchases' })

  // No signature headers at all.
  const bare = await fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
  await bare.body?.cancel()
  assertEquals(bare.status, 404, 'an unsigned request must not reveal the endpoint')

  // Wrong secret.
  assertEquals((await call({ view: 'purchases' }, { secret: 'x'.repeat(40) })).status, 404)

  // Signature valid, but for a DIFFERENT path — a token minted for one route
  // must not be replayable against another.
  assertEquals((await call({ view: 'purchases' }, { path: '/functions/v1/something-else' })).status, 404)

  // Body swapped after signing.
  assertEquals(
    (await call({ view: 'purchases', limit: 1 }, { bodyOverride: JSON.stringify({ view: 'purchases', limit: 200 }) })).status,
    404,
    'the body hash is inside the signature',
  )

  // Stale and future timestamps.
  const now = Math.floor(Date.now() / 1000)
  assertEquals((await call({ view: 'purchases' }, { ts: now - 3600 })).status, 404)
  assertEquals((await call({ view: 'purchases' }, { ts: now + 3600 })).status, 404)
})

Deno.test('72a. a short secret is refused even when the signature matches', async () => {
  // The scheme rests on the secret being unguessable, so the function refuses
  // to honour anything under 32 chars rather than quietly accepting a weak one.
  const weak = 'short-secret'
  const body = JSON.stringify({ view: 'purchases' })
  const headers = await signAdminRequest(weak, 'POST', PATH, body)
  const res = await fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body })
  await res.body?.cancel()
  assertEquals(res.status, 404)
})

Deno.test('73a. GET is a 404 (the endpoint answers only signed POSTs)', async () => {
  const res = await fetch(URL_)
  await res.body?.cancel()
  assertEquals(res.status, 404)
})

Deno.test('74a. an unknown view is a 404 — there is no query language to widen', async () => {
  for (const view of ['licenses', 'users', 'auth.users', '*', '', null, { $ne: null }]) {
    assertEquals((await call({ view })).status, 404, `should reject view ${JSON.stringify(view)}`)
  }
})

Deno.test('75a. buyer emails are MASKED by default and only unmasked on request', async () => {
  const user = await createTestUser(uniqueEmail('a75'))
  const order = `ord_a75_${crypto.randomUUID().slice(0, 8)}`
  const raw = JSON.stringify({
    type: 'order.paid',
    timestamp: new Date().toISOString(),
    data: {
      id: order, status: 'paid', paid: true, billing_reason: 'purchase',
      currency: 'usd', total_amount: 14900, subscription_id: null,
      customer_id: 'cus_a75', customer: { id: 'cus_a75', email: user.email },
      metadata: { user_id: user.id },
    },
  })
  await postPolarWebhook(raw, await signPolarWebhook(polarWebhookSecret, raw))
  try {
    const masked = await call({ view: 'purchases', limit: 100 })
    const row = (masked.body.rows as { order_id: string; buyer_email: string }[]).find((r) => r.order_id === order)
    assert(row, 'the purchase should be listed')
    assert(row!.buyer_email.includes('***'), `expected a masked address, got ${row!.buyer_email}`)
    assert(!row!.buyer_email.includes(user.email), 'the full address must not be present')
    assertEquals(masked.body.revealed, false)

    const revealed = await call({ view: 'purchases', limit: 100, reveal: true })
    const full = (revealed.body.rows as { order_id: string; buyer_email: string }[]).find((r) => r.order_id === order)
    assertEquals(full!.buyer_email, user.email)
    assertEquals(revealed.body.revealed, true, 'the response records that it was unmasked, so callers can audit it')
  } finally {
    await admin.from('licenses').delete().eq('order_id', order)
    await admin.from('webhook_events').delete().eq('provider', 'polar').eq('payload->data->>id', order)
    await deleteTestUser(user.id)
  }
})

Deno.test('76a. account uuids never leave the function', async () => {
  const res = await call({ view: 'purchases', limit: 50 })
  const rows = res.body.rows as Record<string, unknown>[]
  for (const row of rows) {
    assert(!('user_id' in row) || row.user_id === undefined, 'raw account ids must not be shipped')
    assert('attached' in row, 'the page asks whether it is attached, not who to')
  }
})

Deno.test('77a. the row cap cannot be exceeded', async () => {
  for (const limit of [10_000, -1, 0, Number.MAX_SAFE_INTEGER, 'all', null]) {
    const res = await call({ view: 'purchases', limit })
    assertEquals(res.status, 200, `limit ${JSON.stringify(limit)} should be clamped, not rejected`)
    assert((res.body.rows as unknown[]).length <= 200, 'never more than the hard cap')
  }
})

Deno.test('78a. refunds view returns reasons but no buyer addresses', async () => {
  const res = await call({ view: 'refunds', limit: 20 })
  assertEquals(res.status, 200)
  for (const row of res.body.rows as Record<string, unknown>[]) {
    assert(!('buyer_email' in row), 'a refund row is identified by its order, not by an address')
    assert('reason' in row)
  }
})
