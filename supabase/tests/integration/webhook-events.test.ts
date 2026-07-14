// §8 case 21: webhook_events idempotency constraint (Phase 2 readiness).

import { assert, assertEquals } from 'jsr:@std/assert@1'
import { adminClient, requireStack } from '../helpers.ts'

requireStack()
const admin = adminClient()

Deno.test('21. duplicate (provider, event_id) insert violates the unique constraint', async () => {
  const eventId = `evt-${crypto.randomUUID()}`
  const row = {
    provider: 'lemonsqueezy',
    event_id: eventId,
    event_name: 'order_created',
    payload: { test: true },
  }
  try {
    const first = await admin.from('webhook_events').insert(row)
    assertEquals(first.error, null)

    const dup = await admin.from('webhook_events').insert(row)
    assert(dup.error !== null, 'duplicate insert must fail')
    assertEquals(dup.error!.code, '23505')

    // A different event id for the same provider is fine.
    const other = await admin.from('webhook_events').insert({ ...row, event_id: `${eventId}-2` })
    assertEquals(other.error, null)
  } finally {
    await admin.from('webhook_events').delete().like('event_id', `${eventId}%`)
  }
})
