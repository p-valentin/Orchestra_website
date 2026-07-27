// Polar webhook suite — the §6 equivalents of the Paddle cases (29p–39p),
// plus the paths that are specific to Polar's wire format:
//   - idempotency keyed on the `webhook-id` HEADER (the payload carries no
//     event id at all), so a replay under a fresh id must fail the signature
//     rather than double-process;
//   - attach strictly by metadata.user_id, with NO email fallback in the
//     webhook — the adversarial cases below are the ones that would catch a
//     regression back to email matching.
//
// The functions are served with RESEND_BASE_URL pointing at a dead port
// (scripts/setup-test-env.ts), so every claim-email send exercises the
// best-effort failure path.

import { assertEquals, assertExists } from 'jsr:@std/assert@1'
import {
  adminClient,
  callFn,
  createTestUser,
  deleteTestUser,
  loadTestKeys,
  postPolarWebhook,
  randomFingerprint,
  requireStack,
  signPolarWebhook,
  SUPABASE_URL,
  uniqueEmail,
} from '../helpers.ts'

requireStack()
const admin = adminClient()
const { polarWebhookSecret } = await loadTestKeys()

let seq = Date.now()
const nextId = (prefix: string) => `${prefix}_${++seq}`

// ---------- payload builders (shapes from Polar's OpenAPI schemas) ----------

function orderPaid(
  orderId: string,
  email: string,
  opts: { userId?: string | null; subscriptionId?: string; invoiceNumber?: string; metadata?: unknown } = {},
): string {
  const metadata = 'metadata' in opts
    ? opts.metadata
    : opts.userId === undefined
    ? {}
    : opts.userId === null
    ? {}
    : { user_id: opts.userId }
  return JSON.stringify({
    type: 'order.paid',
    timestamp: new Date().toISOString(),
    data: {
      id: orderId,
      status: 'paid',
      paid: true,
      billing_reason: 'purchase',
      currency: 'usd',
      total_amount: 14900,
      invoice_number: opts.invoiceNumber ?? null,
      subscription_id: opts.subscriptionId ?? null,
      product_id: 'prod_orchestra_lifetime',
      customer_id: 'cus_test',
      customer: { id: 'cus_test', email, email_verified: true },
      metadata,
    },
  })
}

function orderRefunded(orderId: string, email: string, status = 'refunded'): string {
  return JSON.stringify({
    type: 'order.refunded',
    timestamp: new Date().toISOString(),
    data: {
      id: orderId,
      status,
      paid: true,
      billing_reason: 'purchase',
      refunded_amount: 14900,
      customer_id: 'cus_test',
      customer: { id: 'cus_test', email },
      metadata: {},
    },
  })
}

function refundEvent(orderId: string, status: string, type = 'refund.created'): string {
  return JSON.stringify({
    type,
    timestamp: new Date().toISOString(),
    data: {
      id: nextId('ref'),
      order_id: orderId,
      status,
      reason: 'customer_request',
      amount: 14900,
      currency: 'usd',
      customer_id: 'cus_test',
      revoke_benefits: true,
    },
  })
}

async function deliver(raw: string, opts: { id?: string; ts?: number } = {}) {
  return await postPolarWebhook(raw, await signPolarWebhook(polarWebhookSecret, raw, opts))
}

async function cleanupPolar(orderIds: string[]) {
  for (const id of orderIds) {
    await admin.from('licenses').delete().eq('order_id', id)
    await admin.from('webhook_events').delete().eq('provider', 'polar').eq('payload->data->>id', id)
    await admin.from('webhook_events').delete().eq('provider', 'polar').eq('payload->data->>order_id', id)
  }
}

const entitlementBody = () => ({
  fingerprint: randomFingerprint(),
  device_name: 'Polar-PC',
  platform: 'linux',
  app_version: '2.0.0',
})

// ---------- signature ----------

Deno.test('40pl. bad signature / stale ts / missing headers → 401, nothing written', async () => {
  const order = nextId('ord')
  const raw = orderPaid(order, 'buyer40@phase2.test')
  try {
    const good = await signPolarWebhook(polarWebhookSecret, raw)

    // Wrong secret.
    const wrongSecret = await signPolarWebhook('not-the-secret', raw)
    assertEquals((await postPolarWebhook(raw, wrongSecret)).status, 401)

    // Tampered body under an otherwise valid signature.
    const tampered = orderPaid(order, 'attacker@phase2.test')
    assertEquals((await postPolarWebhook(tampered, good)).status, 401)

    // Replayed under a fresh webhook-id: the id is inside the signed content,
    // so swapping it to dodge the idempotency key breaks the MAC.
    assertEquals((await postPolarWebhook(raw, { ...good, 'webhook-id': 'msg_replay' })).status, 401)

    // Stale timestamp, correctly signed for that timestamp.
    const stale = await signPolarWebhook(polarWebhookSecret, raw, { ts: Math.floor(Date.now() / 1000) - 3600 })
    assertEquals((await postPolarWebhook(raw, stale)).status, 401)

    // Each header missing in turn.
    for (const missing of ['webhook-id', 'webhook-timestamp', 'webhook-signature']) {
      const partial = { ...good }
      delete partial[missing]
      assertEquals((await postPolarWebhook(raw, partial)).status, 401, `missing ${missing} must 401`)
    }

    const { data: lic } = await admin.from('licenses').select('id').eq('order_id', order)
    assertEquals(lic!.length, 0, 'no rejected delivery may write anything')
  } finally {
    await cleanupPolar([order])
  }
})

// ---------- purchase ----------

Deno.test('41pl. order.paid with metadata.user_id → active license on that account', async () => {
  const user = await createTestUser(uniqueEmail('pl41'))
  const order = nextId('ord')
  try {
    const res = await deliver(orderPaid(order, '  Buyer41@Phase2.TEST ', { userId: user.id, invoiceNumber: 'ORCH-41' }))
    assertEquals(res.status, 200)

    const { data: lic } = await admin.from('licenses').select('*').eq('order_id', order).single()
    assertExists(lic)
    assertEquals(lic!.buyer_email, 'buyer41@phase2.test', 'email normalized')
    assertEquals(lic!.status, 'active')
    assertEquals(lic!.plan, 'lifetime')
    assertEquals(lic!.user_id, user.id)
    assertExists(lic!.claimed_at)
  } finally {
    await cleanupPolar([order])
    await deleteTestUser(user.id)
  }
})

Deno.test('42pl. same webhook-id delivered twice → exactly one license, second call 200', async () => {
  const user = await createTestUser(uniqueEmail('pl42'))
  const order = nextId('ord')
  const raw = orderPaid(order, 'buyer42@phase2.test', { userId: user.id })
  const id = `msg_${crypto.randomUUID()}` // fixed → a true redelivery
  try {
    assertEquals((await deliver(raw, { id })).status, 200)
    assertEquals((await deliver(raw, { id })).status, 200)

    const { data: rows } = await admin.from('licenses').select('id').eq('order_id', order)
    assertEquals(rows!.length, 1)

    const { data: events } = await admin.from('webhook_events').select('id').eq('provider', 'polar').eq('event_id', id)
    assertEquals(events!.length, 1, 'one stored event per webhook-id')
  } finally {
    await cleanupPolar([order])
    await deleteTestUser(user.id)
  }
})

Deno.test('42pl-b. the SAME order redelivered under a new webhook-id still yields one license', async () => {
  // Polar guarantees a stable webhook-id across retries, but a dashboard
  // "resend" is a genuinely new message. The order_id upsert has to be the
  // second line of defence.
  const user = await createTestUser(uniqueEmail('pl42b'))
  const order = nextId('ord')
  const raw = orderPaid(order, 'buyer42b@phase2.test', { userId: user.id })
  try {
    assertEquals((await deliver(raw)).status, 200)
    assertEquals((await deliver(raw)).status, 200)

    const { data: rows } = await admin.from('licenses').select('id, user_id').eq('order_id', order)
    assertEquals(rows!.length, 1)
    assertEquals(rows![0].user_id, user.id)
  } finally {
    await cleanupPolar([order])
    await deleteTestUser(user.id)
  }
})

// ---------- adversarial attribution ----------

Deno.test('43pl. an order whose metadata.user_id is A never produces a license for B', async () => {
  const alice = await createTestUser(uniqueEmail('pl43-alice'))
  const bob = await createTestUser(uniqueEmail('pl43-bob'))
  const order = nextId('ord')
  try {
    // The checkout email is BOB's — the one thing a buyer can edit at Polar.
    // The binding must follow metadata.user_id (Alice), not the email.
    assertEquals((await deliver(orderPaid(order, bob.email, { userId: alice.id }))).status, 200)

    const { data: lic } = await admin.from('licenses').select('user_id, buyer_email').eq('order_id', order).single()
    assertEquals(lic!.user_id, alice.id, 'attaches to the account that clicked Buy')
    assertEquals(lic!.buyer_email, bob.email, 'buyer_email still records the address typed at Polar')

    const { data: bobRows } = await admin.from('licenses').select('id').eq('user_id', bob.id)
    assertEquals(bobRows!.length, 0, 'B must hold no license from A’s order')

    // And B's entitlement must not see it.
    const ent = await callFn('entitlement', { token: bob.accessToken, body: entitlementBody() })
    assertEquals(ent.status, 200, 'B falls through to their own trial')
    const { data: bobStill } = await admin.from('licenses').select('id').eq('user_id', bob.id)
    assertEquals(bobStill!.length, 0, 'entitlement must not retro-attach A’s order to B')
  } finally {
    await cleanupPolar([order])
    await deleteTestUser(alice.id)
    await deleteTestUser(bob.id)
  }
})

Deno.test('44pl. missing metadata → unclaimed, and NOT attached by email even when that account exists', async () => {
  // This is the regression guard for the deliberate divergence from the Paddle
  // handler: webhooks-polar must never call the email→account lookup. The
  // account exists and matches the buyer email exactly, and it still must not
  // be attached at webhook time.
  const user = await createTestUser(uniqueEmail('pl44'))
  const order = nextId('ord')
  try {
    assertEquals((await deliver(orderPaid(order, user.email))).status, 200)

    const { data: lic } = await admin.from('licenses').select('user_id, claimed_at, status').eq('order_id', order).single()
    assertEquals(lic!.user_id, null, 'left unclaimed — no email fallback in the webhook')
    assertEquals(lic!.claimed_at, null)
    assertEquals(lic!.status, 'active', 'still a paid license, just unattached')

    // The buyer recovers it the reviewed way: signing in auto-claims against
    // their own confirmed address.
    const ent = await callFn('entitlement', { token: user.accessToken, body: entitlementBody() })
    assertEquals(ent.status, 200)
    const { data: after } = await admin.from('licenses').select('user_id').eq('order_id', order).single()
    assertEquals(after!.user_id, user.id, 'entitlement auto-claim still works')
  } finally {
    await cleanupPolar([order])
    await deleteTestUser(user.id)
  }
})

Deno.test('45pl. malformed metadata.user_id → unclaimed, 200, no crash', async () => {
  const cases: Array<[string, unknown]> = [
    ['not a uuid', { user_id: 'definitely-not-a-uuid' }],
    ['well-formed uuid with no account', { user_id: '11111111-1111-4111-8111-111111111111' }],
    ['wrong type', { user_id: 12345 }],
    ['nested object', { user_id: { id: 'x' } }],
    ['metadata absent entirely', undefined],
    ['metadata is a string', 'user_id=someone'],
  ]
  const orders: string[] = []
  try {
    for (const [label, metadata] of cases) {
      const order = nextId('ord')
      orders.push(order)
      const res = await deliver(orderPaid(order, `buyer45@phase2.test`, { metadata }))
      assertEquals(res.status, 200, `${label}: must not fail the delivery`)

      const { data: lic } = await admin.from('licenses').select('user_id, status').eq('order_id', order).single()
      assertEquals(lic!.user_id, null, `${label}: must be unclaimed, never misattached`)
      assertEquals(lic!.status, 'active', `${label}: the purchase still stands`)
    }
  } finally {
    await cleanupPolar(orders)
  }
})

// ---------- refunds ----------

Deno.test('46pl. order.refunded → refunded, and entitlement reflects it on the next check', async () => {
  const user = await createTestUser(uniqueEmail('pl46'))
  const order = nextId('ord')
  try {
    await deliver(orderPaid(order, user.email, { userId: user.id }))
    const licensed = await callFn('entitlement', { token: user.accessToken, body: entitlementBody() })
    assertEquals(licensed.status, 200, 'licensed before the refund')
    assertExists(licensed.body.token)

    assertEquals((await deliver(orderRefunded(order, user.email))).status, 200)

    const { data: lic } = await admin.from('licenses').select('status').eq('order_id', order).single()
    assertEquals(lic!.status, 'refunded')

    const after = await callFn('entitlement', { token: user.accessToken, body: entitlementBody() })
    assertEquals(after.status, 403)
    assertEquals(after.body.error, 'license_refunded')
  } finally {
    await cleanupPolar([order])
    await deleteTestUser(user.id)
  }
})

Deno.test('46pl-b. a PARTIAL refund also revokes (any refund kills the license)', async () => {
  const user = await createTestUser(uniqueEmail('pl46b'))
  const order = nextId('ord')
  try {
    await deliver(orderPaid(order, user.email, { userId: user.id }))
    assertEquals((await deliver(orderRefunded(order, user.email, 'partially_refunded'))).status, 200)

    const { data: lic } = await admin.from('licenses').select('status').eq('order_id', order).single()
    assertEquals(lic!.status, 'refunded')
  } finally {
    await cleanupPolar([order])
    await deleteTestUser(user.id)
  }
})

Deno.test('47pl. refund.created succeeded → refunded; pending/failed/canceled → untouched', async () => {
  const order = nextId('ord')
  try {
    await deliver(orderPaid(order, 'buyer47@phase2.test', { userId: null }))

    for (const status of ['pending', 'failed', 'canceled']) {
      assertEquals((await deliver(refundEvent(order, status))).status, 200)
      const { data: lic } = await admin.from('licenses').select('status').eq('order_id', order).single()
      assertEquals(lic!.status, 'active', `a ${status} refund must not revoke`)
    }

    assertEquals((await deliver(refundEvent(order, 'succeeded', 'refund.updated'))).status, 200)
    const { data: lic } = await admin.from('licenses').select('status').eq('order_id', order).single()
    assertEquals(lic!.status, 'refunded')
  } finally {
    await cleanupPolar([order])
  }
})

Deno.test('48pl. refund BEFORE purchase → final status refunded in either order', async () => {
  const order = nextId('ord')
  try {
    assertEquals((await deliver(orderRefunded(order, 'buyer48@phase2.test'))).status, 200)
    const { data: mid } = await admin.from('licenses').select('status').eq('order_id', order).single()
    assertEquals(mid!.status, 'refunded', 'the refund creates the row when none exists')

    assertEquals((await deliver(orderPaid(order, 'buyer48@phase2.test'))).status, 200)
    const { data: rows } = await admin.from('licenses').select('status').eq('order_id', order)
    assertEquals(rows!.length, 1)
    assertEquals(rows![0].status, 'refunded', 'a late purchase must not resurrect it')
  } finally {
    await cleanupPolar([order])
  }
})

Deno.test('48pl-b. refund.created before any order → refunded row, no email available', async () => {
  const order = nextId('ord')
  try {
    assertEquals((await deliver(refundEvent(order, 'succeeded'))).status, 200)
    const { data: lic } = await admin.from('licenses').select('status, buyer_email').eq('order_id', order).single()
    assertEquals(lic!.status, 'refunded')
    assertEquals(lic!.buyer_email, '', 'the Refund payload carries no email; the column is not-null')
  } finally {
    await cleanupPolar([order])
  }
})

// ---------- non-actionable traffic ----------

Deno.test('49pl. a subscription order creates no lifetime license', async () => {
  const user = await createTestUser(uniqueEmail('pl49'))
  const order = nextId('ord')
  try {
    const raw = orderPaid(order, user.email, { userId: user.id, subscriptionId: 'sub_123' })
    assertEquals((await deliver(raw)).status, 200)

    const { data: rows } = await admin.from('licenses').select('id').eq('order_id', order)
    assertEquals(rows!.length, 0, 'we sell no subscriptions — a renewal must not mint a lifetime license')
  } finally {
    await cleanupPolar([order])
    await deleteTestUser(user.id)
  }
})

Deno.test('50pl. unrelated event types → 200, stored, no license changes', async () => {
  const ids: string[] = []
  try {
    for (const type of ['checkout.created', 'customer.created', 'order.created', 'order.updated', 'benefit_grant.created']) {
      const id = `msg_${crypto.randomUUID()}`
      ids.push(id)
      const raw = JSON.stringify({ type, timestamp: new Date().toISOString(), data: { id: nextId('obj') } })
      assertEquals((await deliver(raw, { id })).status, 200, `${type} must be accepted`)

      const { data: event } = await admin
        .from('webhook_events').select('event_name, processed_at').eq('provider', 'polar').eq('event_id', id).single()
      assertEquals(event!.event_name, type)
      assertExists(event!.processed_at, 'stored and marked processed')
    }
  } finally {
    for (const id of ids) await admin.from('webhook_events').delete().eq('provider', 'polar').eq('event_id', id)
  }
})

Deno.test('51pl. malformed JSON with a valid signature → 400, handler still alive', async () => {
  const raw = 'this is {{{ not json'
  assertEquals((await deliver(raw)).status, 400)

  const order = nextId('ord')
  try {
    assertEquals((await deliver(orderPaid(order, 'buyer51@phase2.test'))).status, 200, 'handler still alive')
  } finally {
    await cleanupPolar([order])
  }
})

Deno.test('52pl. non-POST → 405', async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/webhooks-polar`)
  await res.body?.cancel()
  assertEquals(res.status, 405)
})
