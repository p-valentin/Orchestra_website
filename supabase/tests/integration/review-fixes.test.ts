// Regression tests for the go-live review fixes:
//   R1. a stuck idempotency slot (event stored, processed_at null) is
//       reprocessed on redelivery instead of being swallowed with a 200
//   R2. chargebacks revoke; chargeback_reverse reinstates; warnings no-op
//   R3. an unclaimed refunded license matching the user's email does NOT
//       block their trial (the bought-then-refunded griefing vector)
//   R4. refresh mode never CREATES a trial
//   R5. the device slot cap holds under concurrent activation (DB trigger)
//   R6. concurrent same-fingerprint activations both succeed with one row
//
// Same prereqs as the rest of tests/integration/ (running local stack).

import { assert, assertEquals } from 'jsr:@std/assert@1'
import {
  adminClient,
  callFn,
  createTestUser,
  deleteTestUser,
  loadTestKeys,
  postPaddleWebhook,
  randomFingerprint,
  requireStack,
  seedLicense,
  signPaddleWebhook,
  uniqueEmail,
} from '../helpers.ts'

requireStack()
const admin = adminClient()
const { paddleWebhookSecret } = await loadTestKeys()

function txnCompleted(txnId: string, ctmId: string, eventId = `evt_${crypto.randomUUID()}`): string {
  return JSON.stringify({
    event_id: eventId,
    event_type: 'transaction.completed',
    occurred_at: new Date().toISOString(),
    data: { id: txnId, status: 'completed', customer_id: ctmId, currency_code: 'USD' },
  })
}

function customerCreated(ctmId: string, email: string): string {
  return JSON.stringify({
    event_id: `evt_${crypto.randomUUID()}`,
    event_type: 'customer.created',
    occurred_at: new Date().toISOString(),
    data: { id: ctmId, email, status: 'active' },
  })
}

function adjustment(txnId: string, action: string, status: string): string {
  return JSON.stringify({
    event_id: `evt_${crypto.randomUUID()}`,
    event_type: 'adjustment.updated',
    occurred_at: new Date().toISOString(),
    data: { id: `adj_${crypto.randomUUID()}`, action, status, transaction_id: txnId },
  })
}

async function deliver(raw: string) {
  return await postPaddleWebhook(raw, { signature: await signPaddleWebhook(paddleWebhookSecret, raw) })
}

async function licenseStatus(txnId: string): Promise<string | null> {
  const { data } = await admin.from('licenses').select('status').eq('order_id', txnId).maybeSingle()
  return data?.status ?? null
}

async function cleanupPaddle(txnIds: string[], ctmIds: string[]) {
  for (const txn of txnIds) {
    await admin.from('licenses').delete().eq('order_id', txn)
    await admin.from('webhook_events').delete().eq('payload->data->>id', txn)
    await admin.from('webhook_events').delete().eq('payload->data->>transaction_id', txn)
  }
  for (const ctm of ctmIds) {
    await admin.from('webhook_events').delete().eq('payload->data->>id', ctm)
  }
}

function entitlementBody(fingerprint: string, extra: Record<string, unknown> = {}) {
  return { fingerprint, device_name: 'Review-PC', platform: 'linux', app_version: '1.4.0', ...extra }
}

Deno.test('R1. stuck idempotency slot: redelivery processes the stored event instead of 200-and-drop', async () => {
  const txn = `txn_${crypto.randomUUID()}`
  const ctm = `ctm_${crypto.randomUUID()}`
  const eventId = `evt_${crypto.randomUUID()}`
  try {
    assertEquals((await deliver(customerCreated(ctm, uniqueEmail('r1')))).status, 200)

    // Simulate an isolate killed mid-processing: the event row exists,
    // processed_at is null, and no license was created.
    const raw = txnCompleted(txn, ctm, eventId)
    const { error } = await admin.from('webhook_events').insert({
      provider: 'paddle',
      event_id: eventId,
      event_name: 'transaction.completed',
      payload: JSON.parse(raw),
    })
    assertEquals(error, null)
    assertEquals(await licenseStatus(txn), null)

    // Paddle's retry of the exact same event must create the license.
    const retry = await deliver(raw)
    assertEquals(retry.status, 200)
    assertEquals(await licenseStatus(txn), 'active')

    // And a further redelivery is a plain dedupe hit: still one license.
    assertEquals((await deliver(raw)).status, 200)
    const { data: rows } = await admin.from('licenses').select('id').eq('order_id', txn)
    assertEquals(rows?.length, 1)
  } finally {
    await cleanupPaddle([txn], [ctm])
  }
})

Deno.test('R2. chargeback revokes the license; reverse reinstates; warning is a no-op', async () => {
  const txn = `txn_${crypto.randomUUID()}`
  const ctm = `ctm_${crypto.randomUUID()}`
  try {
    assertEquals((await deliver(customerCreated(ctm, uniqueEmail('r2')))).status, 200)
    assertEquals((await deliver(txnCompleted(txn, ctm))).status, 200)
    assertEquals(await licenseStatus(txn), 'active')

    assertEquals((await deliver(adjustment(txn, 'chargeback_warning', 'approved'))).status, 200)
    assertEquals(await licenseStatus(txn), 'active')

    assertEquals((await deliver(adjustment(txn, 'chargeback', 'approved'))).status, 200)
    assertEquals(await licenseStatus(txn), 'refunded')

    assertEquals((await deliver(adjustment(txn, 'chargeback_reverse', 'approved'))).status, 200)
    assertEquals(await licenseStatus(txn), 'active')
  } finally {
    await cleanupPaddle([txn], [ctm])
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
