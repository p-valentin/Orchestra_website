// Phase 2 §6 cases 29–38: POST /webhooks-lemonsqueezy.
//
// The functions are served with RESEND_BASE_URL pointing at a dead port (see
// scripts/setup-test-env.ts), so EVERY order_created here also exercises the
// §2.4 rule: a failed claim email never fails the webhook (case 36 makes it
// explicit). Signatures are HMAC-SHA256 hex over the raw body, like LS sends.

import { assert, assertEquals, assertExists } from 'jsr:@std/assert@1'
import {
  adminClient,
  callFn,
  createTestUser,
  deleteTestUser,
  loadTestKeys,
  randomFingerprint,
  requireStack,
  signLsWebhook,
  postLsWebhook,
  uniqueEmail,
} from '../helpers.ts'

requireStack()
const admin = adminClient()
const { lsWebhookSecret } = await loadTestKeys()

let orderSeq = Date.now()
function nextOrderId(): string {
  return String(++orderSeq)
}

function lsPayload(opts: {
  orderId: string
  email: string
  eventName?: string
  status?: string
  orderNumber?: number
}): string {
  return JSON.stringify({
    meta: { event_name: opts.eventName ?? 'order_created', test_mode: true },
    data: {
      type: 'orders',
      id: opts.orderId,
      attributes: {
        identifier: crypto.randomUUID(),
        order_number: opts.orderNumber ?? 10001,
        user_email: opts.email,
        status: opts.status ?? 'paid',
        total: 12900,
        currency: 'USD',
      },
    },
  })
}

async function deliver(raw: string, eventName: string): Promise<{ status: number; body: unknown }> {
  return await postLsWebhook(raw, { signature: await signLsWebhook(lsWebhookSecret, raw), eventName })
}

async function cleanupOrder(orderId: string) {
  await admin.from('licenses').delete().eq('ls_order_id', orderId)
  await admin.from('webhook_events').delete().like('event_id', `%:${orderId}`)
}

Deno.test('29. invalid signature → 401, nothing written', async () => {
  const orderId = nextOrderId()
  const raw = lsPayload({ orderId, email: 'sig29@phase2.test' })
  try {
    const res = await postLsWebhook(raw, { signature: 'deadbeef'.repeat(8), eventName: 'order_created' })
    assertEquals(res.status, 401)
    const missing = await postLsWebhook(raw, { signature: '' })
    assertEquals(missing.status, 401)

    const { data: events } = await admin.from('webhook_events').select('id').like('event_id', `%:${orderId}`)
    assertEquals(events!.length, 0)
    const { data: lic } = await admin.from('licenses').select('id').eq('ls_order_id', orderId)
    assertEquals(lic!.length, 0)
  } finally {
    await cleanupOrder(orderId)
  }
})

Deno.test('30. valid order_created → active license, normalized email', async () => {
  const orderId = nextOrderId()
  const raw = lsPayload({ orderId, email: '  Buyer30@Phase2.TEST ' })
  try {
    const res = await deliver(raw, 'order_created')
    assertEquals(res.status, 200)

    const { data: lic } = await admin.from('licenses').select('*').eq('ls_order_id', orderId).single()
    assertExists(lic)
    assertEquals(lic!.buyer_email, 'buyer30@phase2.test')
    assertEquals(lic!.status, 'active')
    assertEquals(lic!.plan, 'lifetime')
    assertEquals(lic!.user_id, null)
    assertEquals(lic!.legacy_token_hash, null)

    const { data: event } = await admin
      .from('webhook_events').select('processed_at, event_name').eq('event_id', `order_created:${orderId}`).single()
    assertExists(event!.processed_at, 'event marked processed')
  } finally {
    await cleanupOrder(orderId)
  }
})

Deno.test('31. same event delivered twice → one license row, second call 200', async () => {
  const orderId = nextOrderId()
  const raw = lsPayload({ orderId, email: 'buyer31@phase2.test' })
  try {
    const first = await deliver(raw, 'order_created')
    assertEquals(first.status, 200)
    const second = await deliver(raw, 'order_created')
    assertEquals(second.status, 200)

    const { data: rows } = await admin.from('licenses').select('id').eq('ls_order_id', orderId)
    assertEquals(rows!.length, 1)
    const { data: events } = await admin
      .from('webhook_events').select('id').eq('event_id', `order_created:${orderId}`)
    assertEquals(events!.length, 1)
  } finally {
    await cleanupOrder(orderId)
  }
})

Deno.test('32. order_created for an email with an existing account → auto-attached', async () => {
  const email = uniqueEmail('ls32')
  const user = await createTestUser(email)
  const orderId = nextOrderId()
  // Different case than the account email on purpose.
  const raw = lsPayload({ orderId, email: email.toUpperCase() })
  try {
    const res = await deliver(raw, 'order_created')
    assertEquals(res.status, 200)

    const { data: lic } = await admin.from('licenses').select('*').eq('ls_order_id', orderId).single()
    assertEquals(lic!.user_id, user.id)
    assertExists(lic!.claimed_at)
  } finally {
    await cleanupOrder(orderId)
    await deleteTestUser(user.id)
  }
})

Deno.test('33. unknown email stays unclaimed; later /entitlement auto-claims it', async () => {
  const email = uniqueEmail('ls33')
  const orderId = nextOrderId()
  const raw = lsPayload({ orderId, email })
  let userId: string | null = null
  try {
    const res = await deliver(raw, 'order_created')
    assertEquals(res.status, 200)
    const { data: before } = await admin.from('licenses').select('user_id').eq('ls_order_id', orderId).single()
    assertEquals(before!.user_id, null)

    // Buyer registers afterwards — first entitlement call picks the license up.
    const user = await createTestUser(email)
    userId = user.id
    const ent = await callFn('entitlement', {
      token: user.accessToken,
      body: { fingerprint: randomFingerprint(), device_name: 'LS-PC', platform: 'linux', app_version: '2.0.0' },
    })
    assertEquals(ent.status, 200)

    const { data: after } = await admin.from('licenses').select('user_id, claimed_at').eq('ls_order_id', orderId).single()
    assertEquals(after!.user_id, userId)
    assertExists(after!.claimed_at)
  } finally {
    await cleanupOrder(orderId)
    if (userId) await deleteTestUser(userId)
  }
})

Deno.test('34. order_refunded after order_created → status flips to refunded', async () => {
  const orderId = nextOrderId()
  const email = 'buyer34@phase2.test'
  try {
    await deliver(lsPayload({ orderId, email }), 'order_created')
    const refund = await deliver(
      lsPayload({ orderId, email, eventName: 'order_refunded', status: 'refunded' }),
      'order_refunded',
    )
    assertEquals(refund.status, 200)

    const { data: lic } = await admin.from('licenses').select('status').eq('ls_order_id', orderId).single()
    assertEquals(lic!.status, 'refunded')
  } finally {
    await cleanupOrder(orderId)
  }
})

Deno.test('35. order_refunded BEFORE order_created → final status refunded either way', async () => {
  const orderId = nextOrderId()
  const email = 'buyer35@phase2.test'
  try {
    const refund = await deliver(
      lsPayload({ orderId, email, eventName: 'order_refunded', status: 'refunded' }),
      'order_refunded',
    )
    assertEquals(refund.status, 200)
    const { data: mid } = await admin.from('licenses').select('status').eq('ls_order_id', orderId).single()
    assertEquals(mid!.status, 'refunded', 'refund creates the row when none exists')

    // The late order_created must NOT resurrect it.
    const late = await deliver(lsPayload({ orderId, email }), 'order_created')
    assertEquals(late.status, 200)

    const { data: rows } = await admin.from('licenses').select('status, user_id').eq('ls_order_id', orderId)
    assertEquals(rows!.length, 1)
    assertEquals(rows![0].status, 'refunded')
  } finally {
    await cleanupOrder(orderId)
  }
})

Deno.test('36. Resend failure → webhook still 200, license still created', async () => {
  // RESEND_BASE_URL points at a dead port for the whole test run, so the send
  // in this call fails with a connection error — the license must not care.
  const orderId = nextOrderId()
  const raw = lsPayload({ orderId, email: 'buyer36@phase2.test' })
  try {
    const res = await deliver(raw, 'order_created')
    assertEquals(res.status, 200)
    const { data: lic } = await admin.from('licenses').select('status').eq('ls_order_id', orderId).single()
    assertEquals(lic!.status, 'active')
  } finally {
    await cleanupOrder(orderId)
  }
})

Deno.test('37. unknown event type → 200, event stored, no license changes', async () => {
  const orderId = nextOrderId()
  const raw = lsPayload({ orderId, email: 'buyer37@phase2.test', eventName: 'subscription_created' })
  try {
    const res = await deliver(raw, 'subscription_created')
    assertEquals(res.status, 200)

    const { data: event } = await admin
      .from('webhook_events').select('event_name').eq('event_id', `subscription_created:${orderId}`).single()
    assertEquals(event!.event_name, 'subscription_created')
    const { data: lic } = await admin.from('licenses').select('id').eq('ls_order_id', orderId)
    assertEquals(lic!.length, 0)
  } finally {
    await cleanupOrder(orderId)
  }
})

Deno.test('38. malformed JSON with a valid signature → 400, no crash', async () => {
  const raw = 'this is {{{ not json'
  const res = await postLsWebhook(raw, {
    signature: await signLsWebhook(lsWebhookSecret, raw),
    eventName: 'order_created',
  })
  assertEquals(res.status, 400)

  // Handler is still alive and processing valid events.
  const orderId = nextOrderId()
  try {
    const ok = await deliver(lsPayload({ orderId, email: 'buyer38@phase2.test' }), 'order_created')
    assertEquals(ok.status, 200)
  } finally {
    await cleanupOrder(orderId)
  }
})

Deno.test('extra: unpaid order_created (status pending) → stored, no license', async () => {
  const orderId = nextOrderId()
  const raw = lsPayload({ orderId, email: 'buyer-pending@phase2.test', status: 'pending' })
  try {
    const res = await deliver(raw, 'order_created')
    assertEquals(res.status, 200)
    const { data: lic } = await admin.from('licenses').select('id').eq('ls_order_id', orderId)
    assertEquals(lic!.length, 0)
    const { data: event } = await admin
      .from('webhook_events').select('id').eq('event_id', `order_created:${orderId}`)
    assertEquals(event!.length, 1)
  } finally {
    await cleanupOrder(orderId)
  }
})

Deno.test('extra: non-POST → 405', async () => {
  const res = await fetch(`${(await import('../helpers.ts')).SUPABASE_URL}/functions/v1/webhooks-lemonsqueezy`)
  await res.body?.cancel()
  assertEquals(res.status, 405)
})

Deno.test('extra: replayed refund after cleanup-less re-delivery stays idempotent', async () => {
  // order_refunded delivered twice (LS retries) → single event row, no error.
  const orderId = nextOrderId()
  const raw = lsPayload({ orderId, email: 'buyer-replay@phase2.test', eventName: 'order_refunded', status: 'refunded' })
  try {
    const a = await deliver(raw, 'order_refunded')
    const b = await deliver(raw, 'order_refunded')
    assertEquals(a.status, 200)
    assertEquals(b.status, 200)
    const { data: rows } = await admin.from('licenses').select('id').eq('ls_order_id', orderId)
    assertEquals(rows!.length, 1)
  } finally {
    await cleanupOrder(orderId)
  }
})

Deno.test('RLS: webhook_events has no client access at all', async () => {
  const user = await createTestUser(uniqueEmail('ls-rls'))
  try {
    const { userClient } = await import('../helpers.ts')
    const asUser = userClient(user.accessToken)
    const { data, error } = await asUser.from('webhook_events').select('id').limit(1)
    // No policies exist: reads come back empty (or error), never with rows.
    assert((data ?? []).length === 0 || error !== null)
  } finally {
    await deleteTestUser(user.id)
  }
})
