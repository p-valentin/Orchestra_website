// Regression tests for the go-live review fixes:
//   R1. a stuck idempotency slot (event stored, processed_at null) is
//       reprocessed on redelivery instead of being swallowed with a 200
//   R3. an unclaimed refunded license matching the user's email does NOT
//       block their trial (the bought-then-refunded griefing vector)
//   R4. refresh mode never CREATES a trial
//   R5. the device slot cap holds under concurrent activation (DB trigger)
//   R6. concurrent same-fingerprint activations both succeed with one row
//
// R2 used to live here: "chargeback revokes, chargeback_reverse reinstates".
// It was deleted with the Paddle handler rather than ported, because Polar has
// no equivalent mechanism to test. Polar emits no dispute.* webhook — a dispute
// arrives as `Refund.dispute` on the ordinary refund events, and the outcome is
// carried by the refund's own status, so a dispute we win never revokes in the
// first place and there is nothing to reinstate. Test 47pl in
// polar-webhook.test.ts covers the gate that makes that true (only a
// `succeeded` refund revokes; pending/failed/canceled leave the license alone).
//
// Same prereqs as the rest of tests/integration/ (running local stack).

import { assert, assertEquals } from 'jsr:@std/assert@1'
import {
  adminClient,
  callFn,
  createTestUser,
  deleteTestUser,
  loadTestKeys,
  postPolarWebhook,
  randomFingerprint,
  requireStack,
  seedLicense,
  signPolarWebhook,
  uniqueEmail,
} from '../helpers.ts'

requireStack()
const admin = adminClient()
const { polarWebhookSecret } = await loadTestKeys()

function orderPaid(orderId: string, email: string): string {
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
      product_id: 'prod_orchestra_lifetime',
      customer_id: 'cus_review',
      customer: { id: 'cus_review', email, email_verified: true },
      metadata: {},
    },
  })
}

// The idempotency key is the `webhook-id` HEADER, not anything in the body —
// Standard Webhooks puts no event id in the payload. That is exactly why R1
// pre-inserts the row keyed on the id it is about to deliver under.
async function deliver(raw: string, id?: string) {
  return await postPolarWebhook(raw, await signPolarWebhook(polarWebhookSecret, raw, { id }))
}

async function licenseStatus(orderId: string): Promise<string | null> {
  const { data } = await admin.from('licenses').select('status').eq('order_id', orderId).maybeSingle()
  return data?.status ?? null
}

async function cleanupPolar(orderIds: string[], eventIds: string[] = []) {
  for (const id of orderIds) {
    await admin.from('licenses').delete().eq('order_id', id)
    await admin.from('webhook_events').delete().eq('provider', 'polar').eq('payload->data->>id', id)
  }
  for (const id of eventIds) {
    await admin.from('webhook_events').delete().eq('provider', 'polar').eq('event_id', id)
  }
}

function entitlementBody(fingerprint: string, extra: Record<string, unknown> = {}) {
  return { fingerprint, device_name: 'Review-PC', platform: 'linux', app_version: '1.4.0', ...extra }
}

Deno.test('R1. stuck idempotency slot: redelivery processes the stored event instead of 200-and-drop', async () => {
  const order = `ord_${crypto.randomUUID()}`
  const webhookId = `msg_${crypto.randomUUID()}`
  try {
    // Simulate an isolate killed mid-processing: the event row exists with
    // processed_at null, and no license was created. This is the failure the
    // review found — the naive dedupe treated "row exists" as "already done"
    // and returned 200, so the retry that would have fixed it was swallowed
    // and the purchase silently never produced a license.
    const raw = orderPaid(order, uniqueEmail('r1'))
    const { error } = await admin.from('webhook_events').insert({
      provider: 'polar',
      event_id: webhookId,
      event_name: 'order.paid',
      payload: JSON.parse(raw),
    })
    assertEquals(error, null)
    assertEquals(await licenseStatus(order), null)

    // Polar's retry of the same delivery must create the license.
    assertEquals((await deliver(raw, webhookId)).status, 200)
    assertEquals(await licenseStatus(order), 'active')

    // And a further redelivery is a plain dedupe hit: still exactly one.
    assertEquals((await deliver(raw, webhookId)).status, 200)
    const { data: rows } = await admin.from('licenses').select('id').eq('order_id', order)
    assertEquals(rows?.length, 1)
  } finally {
    await cleanupPolar([order], [webhookId])
  }
})

Deno.test('R3. unclaimed refunded license matching the email does not block the trial', async () => {
  const user = await createTestUser(uniqueEmail('r3'))
  const licenseIds: string[] = []
  try {
    // The griefing setup: someone bought with this email and refunded; the
    // row never attached to any account.
    licenseIds.push(await seedLicense({ buyer_email: user.email, status: 'refunded', user_id: null }))

    const res = await callFn('entitlement', {
      token: user.accessToken,
      body: entitlementBody(randomFingerprint()),
    })
    assertEquals(res.status, 200) // trial token, not 403 license_refunded
  } finally {
    for (const id of licenseIds) await admin.from('licenses').delete().eq('id', id)
    await deleteTestUser(user.id)
  }
})

Deno.test('R4. refresh mode never creates a trial row', async () => {
  const user = await createTestUser(uniqueEmail('r4'))
  try {
    const res = await callFn('entitlement', {
      token: user.accessToken,
      body: entitlementBody(randomFingerprint(), { mode: 'refresh' }),
    })
    assertEquals(res.status, 403)

    const { data: trialRows } = await admin.from('trials').select('user_id').eq('user_id', user.id)
    assertEquals(trialRows?.length, 0)
  } finally {
    await deleteTestUser(user.id)
  }
})

Deno.test('R5. six concurrent activations on fresh fingerprints never exceed 3 active devices', async () => {
  const user = await createTestUser(uniqueEmail('r5'))
  const licenseId = await seedLicense({ buyer_email: user.email, user_id: user.id })
  try {
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        callFn('entitlement', { token: user.accessToken, body: entitlementBody(randomFingerprint()) })),
    )
    const ok = results.filter((r) => r.status === 200).length
    const limited = results.filter((r) => r.status === 409).length
    assertEquals(ok + limited, 6, `unexpected statuses: ${results.map((r) => r.status).join(',')}`)
    assert(ok <= 3, `slot cap breached: ${ok} activations succeeded`)

    const { data: active } = await admin
      .from('devices').select('id').eq('user_id', user.id).is('revoked_at', null)
    assert((active?.length ?? 0) <= 3, `slot cap breached in DB: ${active?.length} active devices`)
  } finally {
    await admin.from('devices').delete().eq('user_id', user.id)
    await admin.from('licenses').delete().eq('id', licenseId)
    await deleteTestUser(user.id)
  }
})

Deno.test('R6. concurrent same-fingerprint activations: both succeed, one device row', async () => {
  const user = await createTestUser(uniqueEmail('r6'))
  const licenseId = await seedLicense({ buyer_email: user.email, user_id: user.id })
  const fingerprint = randomFingerprint()
  try {
    const results = await Promise.all([
      callFn('entitlement', { token: user.accessToken, body: entitlementBody(fingerprint) }),
      callFn('entitlement', { token: user.accessToken, body: entitlementBody(fingerprint) }),
    ])
    for (const r of results) assertEquals(r.status, 200)

    const { data: rows } = await admin
      .from('devices').select('id').eq('user_id', user.id).eq('fingerprint_hash', fingerprint)
    assertEquals(rows?.length, 1)
  } finally {
    await admin.from('devices').delete().eq('user_id', user.id)
    await admin.from('licenses').delete().eq('id', licenseId)
    await deleteTestUser(user.id)
  }
})
