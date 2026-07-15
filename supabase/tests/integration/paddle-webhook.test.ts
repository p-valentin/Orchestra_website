// Phase 2 (Paddle) §6 equivalents of cases 29–38, plus Paddle-specific paths:
// buyer email resolution from stored customer.* events, and the
// 500-and-release retry when the email isn't resolvable yet.
//
// The functions are served WITHOUT PADDLE_API_KEY and with RESEND_BASE_URL
// pointing at a dead port (scripts/setup-test-env.ts), so email resolution
// must come from stored events and every claim-email send exercises the
// best-effort failure path.

import { assert, assertEquals, assertExists } from 'jsr:@std/assert@1'
import {
  adminClient,
  callFn,
  createTestUser,
  deleteTestUser,
  loadTestKeys,
  postPaddleWebhook,
  randomFingerprint,
  requireStack,
  signPaddleWebhook,
  SUPABASE_URL,
  uniqueEmail,
} from '../helpers.ts'

requireStack()
const admin = adminClient()
const { paddleWebhookSecret } = await loadTestKeys()

let seq = Date.now()
const nextId = (prefix: string) => `${prefix}_${++seq}`

function txnCompleted(txnId: string, ctmId: string, eventId = `evt_${crypto.randomUUID()}`): string {
  return JSON.stringify({
    event_id: eventId,
    event_type: 'transaction.completed',
    occurred_at: new Date().toISOString(),
    data: { id: txnId, status: 'completed', customer_id: ctmId, currency_code: 'USD', details: { totals: { total: '12900' } } },
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

function refundAdjustment(txnId: string, status: string): string {
  return JSON.stringify({
    event_id: `evt_${crypto.randomUUID()}`,
    event_type: 'adjustment.updated',
    occurred_at: new Date().toISOString(),
    data: { id: nextId('adj'), action: 'refund', status, transaction_id: txnId },
  })
}

async function deliver(raw: string) {
  return await postPaddleWebhook(raw, { signature: await signPaddleWebhook(paddleWebhookSecret, raw) })
}

// Registers a buyer email for a customer id (the normal Paddle flow: the
// customer.created event lands before/with the first transaction).
async function registerCustomer(ctmId: string, email: string) {
  const res = await deliver(customerCreated(ctmId, email))
  assertEquals(res.status, 200)
}

async function cleanupPaddle(ids: { txn?: string[]; ctm?: string[] }) {
  for (const txn of ids.txn ?? []) {
    await admin.from('licenses').delete().eq('order_id', txn)
    await admin.from('webhook_events').delete().like('payload->data->>id', txn)
    await admin.from('webhook_events').delete().eq('payload->data->>transaction_id', txn)
  }
  for (const ctm of ids.ctm ?? []) {
    await admin.from('webhook_events').delete().eq('payload->data->>id', ctm)
  }
}

Deno.test('29p. invalid signature / stale timestamp → 401, nothing written', async () => {
  const txn = nextId('txn')
  const raw = txnCompleted(txn, nextId('ctm'))
  try {
    const bad = await postPaddleWebhook(raw, {
      signature: `ts=${Math.floor(Date.now() / 1000)};h1=${'ab'.repeat(32)}`,
    })
    assertEquals(bad.status, 401)

    const staleTs = Math.floor(Date.now() / 1000) - 3600
    const stale = await postPaddleWebhook(raw, {
      signature: await signPaddleWebhook(paddleWebhookSecret, raw, staleTs),
    })
    assertEquals(stale.status, 401)

    const { data: lic } = await admin.from('licenses').select('id').eq('order_id', txn)
    assertEquals(lic!.length, 0)
  } finally {
    await cleanupPaddle({ txn: [txn] })
  }
})

Deno.test('30p. customer.created + transaction.completed → active license, normalized email', async () => {
  const [txn, ctm] = [nextId('txn'), nextId('ctm')]
  try {
    await registerCustomer(ctm, '  Buyer30P@Phase2.TEST ')
    const res = await deliver(txnCompleted(txn, ctm))
    assertEquals(res.status, 200)

    const { data: lic } = await admin.from('licenses').select('*').eq('order_id', txn).single()
    assertExists(lic)
    assertEquals(lic!.buyer_email, 'buyer30p@phase2.test')
    assertEquals(lic!.status, 'active')
    assertEquals(lic!.plan, 'lifetime')
    assertEquals(lic!.user_id, null)
  } finally {
    await cleanupPaddle({ txn: [txn], ctm: [ctm] })
  }
})

Deno.test('31p. same event delivered twice → one license row, second call 200', async () => {
  const [txn, ctm] = [nextId('txn'), nextId('ctm')]
  const raw = txnCompleted(txn, ctm) // fixed event_id → a true redelivery
  try {
    await registerCustomer(ctm, 'buyer31p@phase2.test')
    assertEquals((await deliver(raw)).status, 200)
    assertEquals((await deliver(raw)).status, 200)

    const { data: rows } = await admin.from('licenses').select('id').eq('order_id', txn)
    assertEquals(rows!.length, 1)
  } finally {
    await cleanupPaddle({ txn: [txn], ctm: [ctm] })
  }
})

Deno.test('32p. buyer email with an existing account → auto-attached', async () => {
  const email = uniqueEmail('pd32')
  const user = await createTestUser(email)
  const [txn, ctm] = [nextId('txn'), nextId('ctm')]
  try {
    await registerCustomer(ctm, email.toUpperCase())
    const res = await deliver(txnCompleted(txn, ctm))
    assertEquals(res.status, 200)

    const { data: lic } = await admin.from('licenses').select('user_id, claimed_at').eq('order_id', txn).single()
    assertEquals(lic!.user_id, user.id)
    assertExists(lic!.claimed_at)
  } finally {
    await cleanupPaddle({ txn: [txn], ctm: [ctm] })
    await deleteTestUser(user.id)
  }
})

Deno.test('33p. unknown email stays unclaimed; later /entitlement auto-claims it', async () => {
  const email = uniqueEmail('pd33')
  const [txn, ctm] = [nextId('txn'), nextId('ctm')]
  let userId: string | null = null
  try {
    await registerCustomer(ctm, email)
    assertEquals((await deliver(txnCompleted(txn, ctm))).status, 200)
    const { data: before } = await admin.from('licenses').select('user_id').eq('order_id', txn).single()
    assertEquals(before!.user_id, null)

    const user = await createTestUser(email)
    userId = user.id
    const ent = await callFn('entitlement', {
      token: user.accessToken,
      body: { fingerprint: randomFingerprint(), device_name: 'Paddle-PC', platform: 'linux', app_version: '2.0.0' },
    })
    assertEquals(ent.status, 200)
    const { data: after } = await admin.from('licenses').select('user_id').eq('order_id', txn).single()
    assertEquals(after!.user_id, userId)
  } finally {
    await cleanupPaddle({ txn: [txn], ctm: [ctm] })
    if (userId) await deleteTestUser(userId)
  }
})

Deno.test('34p. approved refund adjustment after purchase → status refunded', async () => {
  const [txn, ctm] = [nextId('txn'), nextId('ctm')]
  try {
    await registerCustomer(ctm, 'buyer34p@phase2.test')
    await deliver(txnCompleted(txn, ctm))
    const res = await deliver(refundAdjustment(txn, 'approved'))
    assertEquals(res.status, 200)

    const { data: lic } = await admin.from('licenses').select('status').eq('order_id', txn).single()
    assertEquals(lic!.status, 'refunded')
  } finally {
    await cleanupPaddle({ txn: [txn], ctm: [ctm] })
  }
})

Deno.test('34p-b. pending refund adjustment → stored, license untouched', async () => {
  const [txn, ctm] = [nextId('txn'), nextId('ctm')]
  try {
    await registerCustomer(ctm, 'buyer34pb@phase2.test')
    await deliver(txnCompleted(txn, ctm))
    const res = await deliver(refundAdjustment(txn, 'pending_approval'))
    assertEquals(res.status, 200)

    const { data: lic } = await admin.from('licenses').select('status').eq('order_id', txn).single()
    assertEquals(lic!.status, 'active', 'pending refunds must not revoke')
  } finally {
    await cleanupPaddle({ txn: [txn], ctm: [ctm] })
  }
})

Deno.test('35p. refund BEFORE purchase → final status refunded in either order', async () => {
  const [txn, ctm] = [nextId('txn'), nextId('ctm')]
  try {
    const refund = await deliver(refundAdjustment(txn, 'approved'))
    assertEquals(refund.status, 200)
    const { data: mid } = await admin.from('licenses').select('status, buyer_email').eq('order_id', txn).single()
    assertEquals(mid!.status, 'refunded', 'refund creates the row when none exists')

    await registerCustomer(ctm, 'buyer35p@phase2.test')
    const late = await deliver(txnCompleted(txn, ctm))
    assertEquals(late.status, 200)

    const { data: rows } = await admin.from('licenses').select('status').eq('order_id', txn)
    assertEquals(rows!.length, 1)
    assertEquals(rows![0].status, 'refunded', 'late purchase must not resurrect it')
  } finally {
    await cleanupPaddle({ txn: [txn], ctm: [ctm] })
  }
})

Deno.test('36p. Resend failure → webhook still 200, license still created', async () => {
  const [txn, ctm] = [nextId('txn'), nextId('ctm')]
  try {
    await registerCustomer(ctm, 'buyer36p@phase2.test')
    const res = await deliver(txnCompleted(txn, ctm))
    assertEquals(res.status, 200)
    const { data: lic } = await admin.from('licenses').select('status').eq('order_id', txn).single()
    assertEquals(lic!.status, 'active')
  } finally {
    await cleanupPaddle({ txn: [txn], ctm: [ctm] })
  }
})

Deno.test('37p. unrelated event type → 200, stored, no license changes', async () => {
  const raw = JSON.stringify({
    event_id: `evt_${crypto.randomUUID()}`,
    event_type: 'subscription.activated',
    data: { id: nextId('sub') },
  })
  const res = await deliver(raw)
  assertEquals(res.status, 200)
  const eventId = JSON.parse(raw).event_id
  const { data: event } = await admin.from('webhook_events').select('event_name').eq('event_id', eventId).single()
  assertEquals(event!.event_name, 'subscription.activated')
  await admin.from('webhook_events').delete().eq('event_id', eventId)
})

Deno.test('38p. malformed JSON with a valid signature → 400, no crash', async () => {
  const raw = 'this is {{{ not json'
  const res = await postPaddleWebhook(raw, { signature: await signPaddleWebhook(paddleWebhookSecret, raw) })
  assertEquals(res.status, 400)

  const [txn, ctm] = [nextId('txn'), nextId('ctm')]
  try {
    await registerCustomer(ctm, 'buyer38p@phase2.test')
    assertEquals((await deliver(txnCompleted(txn, ctm))).status, 200, 'handler still alive')
  } finally {
    await cleanupPaddle({ txn: [txn], ctm: [ctm] })
  }
})

Deno.test('39p. email unresolvable → 500 with event released; Paddle retry succeeds after customer event', async () => {
  // No stored customer event and no PADDLE_API_KEY: the handler must NOT
  // create an email-less license. It 500s and deletes its webhook_events row
  // so the retry isn't swallowed by the dedupe.
  const [txn, ctm] = [nextId('txn'), nextId('ctm')]
  const raw = txnCompleted(txn, ctm) // fixed event_id across retries
  const eventId = JSON.parse(raw).event_id
  try {
    const first = await deliver(raw)
    assertEquals(first.status, 500)
    const { data: events } = await admin.from('webhook_events').select('id').eq('event_id', eventId)
    assertEquals(events!.length, 0, 'idempotency slot released for the retry')
    const { data: none } = await admin.from('licenses').select('id').eq('order_id', txn)
    assertEquals(none!.length, 0)

    // The customer event lands (Paddle delivers it independently), then the retry.
    await registerCustomer(ctm, 'buyer39p@phase2.test')
    const retry = await deliver(raw)
    assertEquals(retry.status, 200)
    const { data: lic } = await admin.from('licenses').select('buyer_email, status').eq('order_id', txn).single()
    assertEquals(lic!.buyer_email, 'buyer39p@phase2.test')
    assertEquals(lic!.status, 'active')
  } finally {
    await cleanupPaddle({ txn: [txn], ctm: [ctm] })
  }
})

Deno.test('extra: non-POST → 405', async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/webhooks-paddle`)
  await res.body?.cancel()
  assertEquals(res.status, 405)
})
