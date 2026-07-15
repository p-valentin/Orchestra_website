// Unit tests for the Lemon Squeezy surface module (no stack needed).

import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1'
import { parseLsEvent, verifyLsSignature } from '../../functions/_shared/lemonsqueezy.ts'
import { signLsWebhook } from '../helpers.ts'

const SECRET = 'test-webhook-secret'

Deno.test('correct signature verifies; wrong secret / tampered body do not', async () => {
  const body = JSON.stringify({ meta: { event_name: 'order_created' } })
  const sig = await signLsWebhook(SECRET, body)

  assert(await verifyLsSignature(body, sig, SECRET))
  assertFalse(await verifyLsSignature(body, sig, 'other-secret'))
  assertFalse(await verifyLsSignature(body + ' ', sig, SECRET))
  assertFalse(await verifyLsSignature(body, sig.replace(/^../, '00'), SECRET))
})

Deno.test('garbage signatures are rejected without crashing', async () => {
  const body = '{}'
  for (const bad of ['', 'zz', 'not-hex', 'abc', 'deadbeef ', '😀😀']) {
    assertFalse(await verifyLsSignature(body, bad, SECRET), `should reject: ${JSON.stringify(bad)}`)
  }
  assertFalse(await verifyLsSignature(body, await signLsWebhook(SECRET, body), ''), 'empty secret')
})

Deno.test('parseLsEvent extracts and normalizes the interesting fields', () => {
  const event = parseLsEvent(
    {
      meta: { event_name: 'order_created' },
      data: {
        type: 'orders',
        id: 12345,
        attributes: { user_email: '  Buyer@EXAMPLE.com ', status: 'paid', order_number: 777 },
      },
    },
    null,
  )
  assertEquals(event, {
    eventName: 'order_created',
    orderId: '12345',
    buyerEmail: 'buyer@example.com',
    orderStatus: 'paid',
    orderNumber: 777,
  })
})

Deno.test('header event name wins; junk shapes degrade to nulls', () => {
  const fromHeader = parseLsEvent({ meta: { event_name: 'meta_name' } }, 'order_refunded')
  assertEquals(fromHeader.eventName, 'order_refunded')

  for (const junk of [null, {}, { data: 'x' }, { data: { attributes: 42 } }, []]) {
    const event = parseLsEvent(junk, null)
    assertEquals(event.orderId, null)
    assertEquals(event.buyerEmail, null)
    assertEquals(event.eventName, 'unknown')
  }
})
