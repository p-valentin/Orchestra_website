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
