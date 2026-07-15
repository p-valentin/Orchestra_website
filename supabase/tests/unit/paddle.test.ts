// Unit tests for the Paddle surface module (no stack needed).

import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1'
import {
  fetchCustomerEmail,
  parsePaddleEvent,
  verifyPaddleSignature,
} from '../../functions/_shared/paddle.ts'
import { signPaddleWebhook } from '../helpers.ts'

const SECRET = 'pdl_ntfset_test_secret'

Deno.test('correct signature verifies; wrong secret / tampered body / tampered ts do not', async () => {
  const body = JSON.stringify({ event_type: 'transaction.completed' })
  const sig = await signPaddleWebhook(SECRET, body)

  assert(await verifyPaddleSignature(body, sig, SECRET))
  assertFalse(await verifyPaddleSignature(body, sig, 'other-secret'))
  assertFalse(await verifyPaddleSignature(body + ' ', sig, SECRET))
  // Re-stamping the ts without re-signing breaks the MAC (ts is signed).
  const restamped = sig.replace(/ts=\d+/, `ts=${Math.floor(Date.now() / 1000) - 30}`)
  assertFalse(await verifyPaddleSignature(body, restamped, SECRET))
})

Deno.test('stale timestamps are rejected even with a valid MAC (replay window)', async () => {
  const body = '{}'
  const oldTs = Math.floor(Date.now() / 1000) - 3600
  const sig = await signPaddleWebhook(SECRET, body, oldTs)
  assertFalse(await verifyPaddleSignature(body, sig, SECRET))
  // …but the same signature is fine when "now" is inside the window.
  assert(await verifyPaddleSignature(body, sig, SECRET, oldTs + 60))
})

Deno.test('multiple h1 values (secret rotation): any match passes', async () => {
  const body = '{"a":1}'
  const good = await signPaddleWebhook(SECRET, body)
  const [ts, h1] = [good.match(/ts=(\d+)/)![1], good.match(/h1=([0-9a-f]+)/)![1]]
  assert(await verifyPaddleSignature(body, `ts=${ts};h1=${'0'.repeat(64)};h1=${h1}`, SECRET))
})

Deno.test('garbage signature headers are rejected without crashing', async () => {
  const body = '{}'
  for (const bad of ['', 'ts=;h1=', 'h1=deadbeef', 'ts=123', 'ts=abc;h1=zz', 'ts=123;h1=not-hex', '😀']) {
    assertFalse(await verifyPaddleSignature(body, bad, SECRET), `should reject: ${JSON.stringify(bad)}`)
  }
  assertFalse(await verifyPaddleSignature(body, await signPaddleWebhook(SECRET, body), ''), 'empty secret')
})

Deno.test('parsePaddleEvent: transaction / customer / adjustment shapes', () => {
  const txn = parsePaddleEvent({
    event_id: 'evt_1',
    event_type: 'transaction.completed',
    data: { id: 'txn_123', status: 'completed', customer_id: 'ctm_9' },
  })
  assertEquals(txn.entityId, 'txn_123')
  assertEquals(txn.customerId, 'ctm_9')
  assertEquals(txn.transactionStatus, 'completed')
  assertEquals(txn.customerEmail, null)

  const cust = parsePaddleEvent({
    event_type: 'customer.created',
    data: { id: 'ctm_9', email: '  Buyer@EXAMPLE.com ' },
  })
  assertEquals(cust.entityId, 'ctm_9')
  assertEquals(cust.customerId, 'ctm_9')
  assertEquals(cust.customerEmail, 'buyer@example.com')

  const adj = parsePaddleEvent({
    event_type: 'adjustment.updated',
    data: { id: 'adj_5', action: 'refund', status: 'approved', transaction_id: 'txn_123' },
  })
  assertEquals(adj.entityId, 'txn_123', 'adjustments scope to the refunded transaction')
  assertEquals(adj.adjustmentAction, 'refund')
  assertEquals(adj.adjustmentStatus, 'approved')
})

Deno.test('real sandbox payloads (captured 2026-07-15) parse as expected', () => {
  // Verbatim shapes from Paddle's genuine sandbox deliveries — the field
  // paths this module depends on, pinned so a Paddle change surfaces here.
  const customerCreated = {
    event_id: 'evt_01kxk0dqvka5fykw090fsea4e4',
    event_type: 'customer.created',
    notification_id: 'ntf_01kxk0dqx1abc',
    occurred_at: '2026-07-15T13:45:55.5Z',
    data: {
      id: 'ctm_01kxk0dqvd7900yrqnq0rmsax8',
      email: 'valivali10298@gmail.com',
      status: 'active',
      marketing_consent: false,
    },
  }
  const cust = parsePaddleEvent(customerCreated)
  assertEquals(cust.eventType, 'customer.created')
  assertEquals(cust.entityId, 'ctm_01kxk0dqvd7900yrqnq0rmsax8')
  assertEquals(cust.customerEmail, 'valivali10298@gmail.com')

  const transactionCompleted = {
    event_id: 'evt_01kxk0et5ja191npx37n6z37r9',
    event_type: 'transaction.completed',
    notification_id: 'ntf_01kxk0et6mxyz',
    occurred_at: '2026-07-15T13:46:30.1Z',
    data: {
      id: 'txn_01kxk0dqx8b5kgg9gc7vc3v3wt',
      status: 'completed',
      customer_id: 'ctm_01kxk0dqvd7900yrqnq0rmsax8',
      currency_code: 'USD',
      origin: 'web',
      invoice_id: 'inv_01kxk0erwwzmtbny6ez474bse4',
      invoice_number: '113783-10001',
      subscription_id: null,
      custom_data: null,
      details: { totals: { total: '12900', currency_code: 'USD' } },
      items: [{ price: { id: 'pri_01kxjzv27nsc8fmvawx68d2tdf' }, quantity: 1 }],
    },
  }
  const txn = parsePaddleEvent(transactionCompleted)
  assertEquals(txn.entityId, 'txn_01kxk0dqx8b5kgg9gc7vc3v3wt')
  assertEquals(txn.transactionStatus, 'completed')
  assertEquals(txn.customerId, 'ctm_01kxk0dqvd7900yrqnq0rmsax8')
  assertEquals(txn.customerEmail, null, 'transactions never carry the email')
  assertEquals(txn.invoiceNumber, '113783-10001', 'buyer-facing support reference')
})

Deno.test('junk payload shapes degrade to nulls', () => {
  for (const junk of [null, {}, { data: 'x' }, { event_type: 42 }, []]) {
    const event = parsePaddleEvent(junk)
    assertEquals(event.eventType, 'unknown')
    assertEquals(event.entityId, null)
    assertEquals(event.customerEmail, null)
  }
})

Deno.test('fetchCustomerEmail: success, missing customer, and network failure', async () => {
  const server = Deno.serve({ port: 0, onListen: () => {} }, (req) => {
    const url = new URL(req.url)
    if (req.headers.get('Authorization') !== 'Bearer test-key') return new Response('nope', { status: 403 })
    if (url.pathname === '/customers/ctm_known') {
      return Response.json({ data: { id: 'ctm_known', email: '  Known@Buyer.COM ' } })
    }
    return new Response('not found', { status: 404 })
  })
  const base = `http://127.0.0.1:${server.addr.port}`
  try {
    assertEquals(await fetchCustomerEmail(base, 'test-key', 'ctm_known'), 'known@buyer.com')
    assertEquals(await fetchCustomerEmail(base, 'test-key', 'ctm_missing'), null)
    assertEquals(await fetchCustomerEmail(base, 'wrong-key', 'ctm_known'), null)
    assertEquals(await fetchCustomerEmail('http://127.0.0.1:19998', 'test-key', 'ctm_known'), null)
  } finally {
    await server.shutdown()
  }
})
