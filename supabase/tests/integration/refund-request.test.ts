// Self-serve refund suite. This is the only endpoint that moves money, so the
// cases below are weighted towards the ways it could move the WRONG money:
// someone else's licence, twice, or after the window.
//
// The provider call is pointed at a local mock (POLAR_API_BASE_URL in
// scripts/setup-test-env.ts) rather than skipped — a money-moving path that is
// only ever exercised by hand is a path nobody actually tested.

import { assert, assertEquals, assertExists } from 'jsr:@std/assert@1'
import {
  adminClient,
  callFn,
  createTestUser,
  deleteTestUser,
  loadTestKeys,
  postPolarWebhook,
  requireStack,
  signPolarWebhook,
  uniqueEmail,
  userClient,
} from '../helpers.ts'

requireStack()
const admin = adminClient()
const { polarWebhookSecret } = await loadTestKeys()

let seq = Date.now()
const nextId = (prefix: string) => `${prefix}_${++seq}`

// ---------- mock Polar ----------

interface MockState {
  calls: { orderId: string; amount: number; reason: string }[]
  respond: { status: number; body: unknown }
}
const mock: MockState = { calls: [], respond: { status: 200, body: { id: 'ref_mock' } } }

// hostname 0.0.0.0 so the edge-runtime container can reach it on the docker
// bridge (see POLAR_API_BASE_URL in scripts/setup-test-env.ts).
const mockServer = Deno.serve({ port: 19998, hostname: '0.0.0.0', onListen: () => {} }, async (req) => {
  const url = new URL(req.url)
  if (!url.pathname.startsWith('/v1/refunds')) return new Response('nope', { status: 404 })
  const body = await req.json().catch(() => ({}))
  mock.calls.push({ orderId: body.order_id, amount: body.amount, reason: body.reason })
  return new Response(JSON.stringify(mock.respond.body), {
    status: mock.respond.status,
    headers: { 'Content-Type': 'application/json' },
  })
})

function resetMock() {
  mock.calls = []
  mock.respond = { status: 200, body: { id: `ref_${crypto.randomUUID().slice(0, 8)}` } }
}

// ---------- fixtures ----------

// Creates a purchase the way production does — through the webhook — so the
// stored order.paid event the refund path reads its amount from actually
// exists.
async function buy(
  userId: string,
  email: string,
  opts: { daysAgo?: number; taxCents?: number } = {},
) {
  // A real order carries tax, so total_amount and refundable_amount differ.
  // Every sandbox order had zero tax, which is exactly why the first live
  // refund failed — the fixture defaults to taxed now.
  const tax = opts.taxCents ?? 0
  const order = nextId('ord')
  const raw = JSON.stringify({
    type: 'order.paid',
    timestamp: new Date().toISOString(),
    data: {
      id: order,
      status: 'paid',
      paid: true,
      billing_reason: 'purchase',
      currency: 'usd',
      total_amount: 14900,
      net_amount: 14900 - tax,
      tax_amount: tax,
      refundable_amount: 14900 - tax,
      refunded_amount: 0,
      subscription_id: null,
      customer_id: 'cus_test',
      customer: { id: 'cus_test', email },
      metadata: { user_id: userId },
    },
  })
  const res = await postPolarWebhook(raw, await signPolarWebhook(polarWebhookSecret, raw))
  assertEquals(res.status, 200)
  if (opts.daysAgo) {
    const when = new Date(Date.now() - opts.daysAgo * 86_400_000).toISOString()
    await admin.from('licenses').update({ purchased_at: when }).eq('order_id', order)
  }
  return order
}

async function cleanup(orders: string[], userIds: string[]) {
  for (const o of orders) {
    await admin.from('refund_requests').delete().eq('order_id', o)
    await admin.from('licenses').delete().eq('order_id', o)
    await admin.from('webhook_events').delete().eq('provider', 'polar').eq('payload->data->>id', o)
    await admin.from('webhook_events').delete().eq('provider', 'polar').eq('payload->data->>order_id', o)
  }
  for (const u of userIds) await deleteTestUser(u)
}

// ---------- tests ----------

Deno.test('60r. unauthenticated → 401, nothing touched', async () => {
  resetMock()
  const res = await callFn('refund-request', { body: { reason: 'bugs' } })
  assertEquals(res.status, 401)
  assertEquals(mock.calls.length, 0, 'the provider must never be called without a caller')
})

Deno.test('61r. happy path → provider called once, request recorded as refunded', async () => {
  resetMock()
  const user = await createTestUser(uniqueEmail('r61'))
  const order = await buy(user.id, user.email)
  try {
    const res = await callFn('refund-request', {
      token: user.accessToken,
      body: { reason: 'missing_feature', detail: 'No Firefox support' },
    })
    assertEquals(res.status, 200)
    assertEquals(res.body.status, 'refunded')

    assertEquals(mock.calls.length, 1, 'exactly one provider call')
    assertEquals(mock.calls[0].orderId, order)
    assertEquals(mock.calls[0].amount, 14900, 'amount comes from the stored order, not the request')
    assertEquals(mock.calls[0].reason, 'customer_request')

    const { data: rr } = await admin.from('refund_requests').select('*').eq('order_id', order).single()
    assertEquals(rr!.status, 'refunded')
    assertEquals(rr!.reason, 'missing_feature')
    assertEquals(rr!.detail, 'No Firefox support')
    assertEquals(rr!.amount_cents, 14900)
    assertExists(rr!.completed_at)

    // The licence is NOT deactivated here — that is the webhook's job, so that
    // there is exactly one writer of entitlement state.
    const { data: lic } = await admin.from('licenses').select('status').eq('order_id', order).single()
    assertEquals(lic!.status, 'active', 'deactivation belongs to order.refunded, not to this endpoint')
  } finally {
    await cleanup([order], [user.id])
  }
})

Deno.test('62r. a second request is refused — the provider is called once, not twice', async () => {
  resetMock()
  const user = await createTestUser(uniqueEmail('r62'))
  const order = await buy(user.id, user.email)
  try {
    assertEquals((await callFn('refund-request', { token: user.accessToken, body: { reason: 'bugs' } })).status, 200)
    const second = await callFn('refund-request', { token: user.accessToken, body: { reason: 'bugs' } })
    assertEquals(second.status, 409)
    assertEquals(second.body.error, 'already_requested')
    assertEquals(mock.calls.length, 1, 'the unique index must stop a second refund')
  } finally {
    await cleanup([order], [user.id])
  }
})

Deno.test('62r-b. concurrent double-click refunds exactly once', async () => {
  // The realistic version of the above: two in-flight requests, not two
  // sequential ones. Only the database can serialise these.
  resetMock()
  const user = await createTestUser(uniqueEmail('r62b'))
  const order = await buy(user.id, user.email)
  try {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        callFn('refund-request', { token: user.accessToken, body: { reason: 'too_expensive' } })),
    )
    const ok = results.filter((r) => r.status === 200)
    const conflict = results.filter((r) => r.status === 409)
    assertEquals(ok.length, 1, 'exactly one caller may win')
    assertEquals(conflict.length, 4)
    assertEquals(mock.calls.length, 1, 'and the provider is called exactly once')

    const { data: rows } = await admin.from('refund_requests').select('id').eq('order_id', order)
    assertEquals(rows!.length, 1)
  } finally {
    await cleanup([order], [user.id])
  }
})

Deno.test('63r. outside the 14-day window → 409, provider untouched', async () => {
  resetMock()
  const user = await createTestUser(uniqueEmail('r63'))
  const order = await buy(user.id, user.email, { daysAgo: 15 })
  try {
    const res = await callFn('refund-request', { token: user.accessToken, body: { reason: 'bugs' } })
    assertEquals(res.status, 409)
    assertEquals(res.body.error, 'window_closed')
    assertEquals(mock.calls.length, 0)
  } finally {
    await cleanup([order], [user.id])
  }
})

Deno.test('63r-b. day 13 is still inside the window', async () => {
  resetMock()
  const user = await createTestUser(uniqueEmail('r63b'))
  const order = await buy(user.id, user.email, { daysAgo: 13 })
  try {
    assertEquals((await callFn('refund-request', { token: user.accessToken, body: { reason: 'bugs' } })).status, 200)
  } finally {
    await cleanup([order], [user.id])
  }
})

Deno.test('64r. ADVERSARIAL: B cannot refund A’s licence', async () => {
  resetMock()
  const alice = await createTestUser(uniqueEmail('r64-a'))
  const bob = await createTestUser(uniqueEmail('r64-b'))
  const order = await buy(alice.id, alice.email)
  try {
    // Bob holds no licence. Every shape of "point at Alice's purchase" must
    // fail — the endpoint reads the caller's own licence and takes no id.
    for (const body of [
      { reason: 'bugs' },
      { reason: 'bugs', license_id: order },
      { reason: 'bugs', order_id: order },
      { reason: 'bugs', user_id: alice.id },
    ]) {
      const res = await callFn('refund-request', { token: bob.accessToken, body })
      assertEquals(res.status, 404, `must not refund via ${JSON.stringify(body)}`)
      assertEquals(res.body.error, 'no_refundable_license')
    }
    assertEquals(mock.calls.length, 0, 'the provider must never be called for a licence the caller does not own')

    const { data: lic } = await admin.from('licenses').select('status').eq('order_id', order).single()
    assertEquals(lic!.status, 'active', 'Alice’s licence is untouched')
    const { data: rr } = await admin.from('refund_requests').select('id').eq('order_id', order)
    assertEquals(rr!.length, 0)
  } finally {
    await cleanup([order], [alice.id, bob.id])
  }
})

Deno.test('65r. an invalid reason is rejected before anything happens', async () => {
  resetMock()
  const user = await createTestUser(uniqueEmail('r65'))
  const order = await buy(user.id, user.email)
  try {
    for (const reason of ['', 'nonsense', "'; drop table licenses; --", null, 42]) {
      const res = await callFn('refund-request', { token: user.accessToken, body: { reason } })
      assertEquals(res.status, 400, `should reject reason ${JSON.stringify(reason)}`)
    }
    assertEquals(mock.calls.length, 0)
    const { data: rr } = await admin.from('refund_requests').select('id').eq('order_id', order)
    assertEquals(rr!.length, 0, 'no row for a rejected reason')
  } finally {
    await cleanup([order], [user.id])
  }
})

Deno.test('66r. provider failure → marked failed, licence stays active, buyer may retry', async () => {
  resetMock()
  mock.respond = { status: 422, body: { detail: 'nothing refundable' } }
  const user = await createTestUser(uniqueEmail('r66'))
  const order = await buy(user.id, user.email)
  try {
    const res = await callFn('refund-request', { token: user.accessToken, body: { reason: 'bugs' } })
    assertEquals(res.status, 502)
    assertEquals(res.body.error, 'refund_not_possible')
    // The provider's message must not reach the browser.
    assert(!JSON.stringify(res.body).includes('nothing refundable'), 'provider detail must not leak')

    const { data: rr } = await admin.from('refund_requests').select('status, failure_reason').eq('order_id', order).single()
    assertEquals(rr!.status, 'failed')
    assertExists(rr!.failure_reason)

    const { data: lic } = await admin.from('licenses').select('status').eq('order_id', order).single()
    assertEquals(lic!.status, 'active', 'a failed refund must not deactivate anything')

    // A failed attempt frees the guard, so a retry is possible.
    resetMock()
    assertEquals((await callFn('refund-request', { token: user.accessToken, body: { reason: 'bugs' } })).status, 200)
    assertEquals(mock.calls.length, 1)
  } finally {
    await cleanup([order], [user.id])
  }
})

Deno.test('67r. no licence at all → 404, provider untouched', async () => {
  resetMock()
  const user = await createTestUser(uniqueEmail('r67'))
  try {
    const res = await callFn('refund-request', { token: user.accessToken, body: { reason: 'bugs' } })
    assertEquals(res.status, 404)
    assertEquals(mock.calls.length, 0)
  } finally {
    await cleanup([], [user.id])
  }
})

Deno.test('68r. an already-refunded licence cannot be refunded again', async () => {
  resetMock()
  const user = await createTestUser(uniqueEmail('r68'))
  const order = await buy(user.id, user.email)
  try {
    await admin.from('licenses').update({ status: 'refunded' }).eq('order_id', order)
    const res = await callFn('refund-request', { token: user.accessToken, body: { reason: 'bugs' } })
    assertEquals(res.status, 404, 'only an ACTIVE licence is refundable')
    assertEquals(mock.calls.length, 0)
  } finally {
    await cleanup([order], [user.id])
  }
})

Deno.test('69r. RLS: a buyer reads only their own refund requests', async () => {
  resetMock()
  const alice = await createTestUser(uniqueEmail('r69-a'))
  const bob = await createTestUser(uniqueEmail('r69-b'))
  const order = await buy(alice.id, alice.email)
  try {
    assertEquals((await callFn('refund-request', { token: alice.accessToken, body: { reason: 'bugs' } })).status, 200)

    const asBob = userClient(bob.accessToken)
    assertEquals((await asBob.from('refund_requests').select('id')).data!.length, 0, 'B sees nothing of A’s')

    const asAlice = userClient(alice.accessToken)
    assertEquals((await asAlice.from('refund_requests').select('id')).data!.length, 1)

    // And nobody writes from the browser.
    const { error } = await asAlice.from('refund_requests').insert({
      license_id: crypto.randomUUID(), order_id: 'x', reason: 'bugs',
    })
    assert(error !== null, 'clients must not be able to insert refund requests')
  } finally {
    await cleanup([order], [alice.id, bob.id])
  }
})

// Deno.serve keeps the process alive; shut the mock down after the last case.
globalThis.addEventListener('unload', () => {
  try {
    mockServer.shutdown()
  } catch { /* already gone */ }
})

Deno.test('70r. a licence with no stored Polar order is not self-refundable', async () => {
  // Paddle-era purchases (and anything predating the event store) have no
  // order.paid event to read an amount from. The buyer must get an honest
  // "needs a human", NOT "try again shortly" for something that will never
  // work — and no failed row should be left behind to clutter the admin view.
  resetMock()
  const user = await createTestUser(uniqueEmail('r70'))
  const order = `txn_legacy_${crypto.randomUUID().slice(0, 8)}`
  const { data: lic } = await admin.from('licenses').insert({
    order_id: order, buyer_email: user.email, user_id: user.id,
    status: 'active', plan: 'lifetime',
  }).select('id').single()
  try {
    const res = await callFn('refund-request', { token: user.accessToken, body: { reason: 'bugs' } })
    assertEquals(res.status, 409)
    assertEquals(res.body.error, 'not_self_refundable')
    assertEquals(mock.calls.length, 0, 'the provider must not be called without a known amount')

    const { data: rr } = await admin.from('refund_requests').select('id').eq('license_id', lic!.id)
    assertEquals(rr!.length, 0, 'no stray failed row for a licence that was never refundable')

    const { data: after } = await admin.from('licenses').select('status').eq('id', lic!.id).single()
    assertEquals(after!.status, 'active')
  } finally {
    await cleanup([order], [user.id])
  }
})

Deno.test('71r. a TAXED order refunds the net amount, not the tax-inclusive total', async () => {
  // The bug that reached production: Polar's refund API takes the NET amount
  // and adds the proportional tax back itself. Sending total_amount is
  // rejected with "Refund amount exceeds refundable amount".
  //
  // It survived the whole sandbox suite because every sandbox order had
  // tax_amount 0, which made the two numbers identical. This asserts they are
  // NOT identical and that we send the right one.
  resetMock()
  const user = await createTestUser(uniqueEmail('r71'))
  const order = await buy(user.id, user.email, { taxCents: 2400 })
  try {
    const res = await callFn('refund-request', { token: user.accessToken, body: { reason: 'bugs' } })
    assertEquals(res.status, 200)

    assertEquals(mock.calls.length, 1)
    assertEquals(mock.calls[0].amount, 12500, 'must send net (14900 - 2400), not the 14900 total')

    // The stored figure is what the buyer PAID, because a human reconciles it
    // against a receipt — that is a different number from the one Polar wants.
    const { data: rr } = await admin.from('refund_requests').select('amount_cents').eq('order_id', order).single()
    assertEquals(rr!.amount_cents, 14900, 'admin sees what was charged, tax included')
  } finally {
    await cleanup([order], [user.id])
  }
})
