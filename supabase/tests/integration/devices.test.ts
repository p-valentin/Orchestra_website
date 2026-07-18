// §8 cases 10–12: GET /devices and POST /devices/deactivate.

import { assert, assertEquals, assertExists } from 'jsr:@std/assert@1'
import {
  adminClient,
  callFn,
  createTestUser,
  deleteTestUser,
  randomFingerprint,
  requireStack,
  uniqueEmail,
} from '../helpers.ts'

requireStack()
const admin = adminClient()

// Devices are seeded directly with the service role — device listing and
// deactivation don't require a license.
async function seedDevice(userId: string, name: string, revoked = false): Promise<string> {
  const { data, error } = await admin
    .from('devices')
    .insert({
      user_id: userId,
      fingerprint_hash: randomFingerprint(),
      name,
      platform: 'linux',
      app_version: '1.4.0',
      revoked_at: revoked ? new Date().toISOString() : null,
    })
    .select('id')
    .single()
  if (error) throw new Error(`seedDevice failed: ${error.message}`)
  return data.id as string
}

Deno.test('10. list returns only the authenticated user’s devices (revoked included)', async () => {
  const userA = await createTestUser(uniqueEmail('dev10a'))
  const userB = await createTestUser(uniqueEmail('dev10b'))
  try {
    await seedDevice(userA.id, 'A-active')
    await seedDevice(userA.id, 'A-revoked', true)
    await seedDevice(userB.id, 'B-active')

    const res = await callFn('devices', { method: 'GET', token: userA.accessToken })
    assertEquals(res.status, 200)
    const names = res.body.devices.map((d: { name: string }) => d.name).sort()
    assertEquals(names, ['A-active', 'A-revoked'])
    for (const d of res.body.devices) {
      assertExists(d.id)
      assert('platform' in d && 'app_version' in d && 'last_seen_at' in d && 'revoked_at' in d)
    }
  } finally {
    await deleteTestUser(userA.id)
    await deleteTestUser(userB.id)
  }
})

Deno.test('11. deactivate own device → 200 and revoked_at set; repeat → 200 (idempotent)', async () => {
  const user = await createTestUser(uniqueEmail('dev11'))
  try {
    const deviceId = await seedDevice(user.id, 'to-revoke')

    const first = await callFn('devices/deactivate', {
      token: user.accessToken,
      body: { device_id: deviceId },
    })
    assertEquals(first.status, 200)
    assertEquals(first.body.ok, true)

    const { data: row } = await admin.from('devices').select('revoked_at').eq('id', deviceId).single()
    assertExists(row!.revoked_at)

    const second = await callFn('devices/deactivate', {
      token: user.accessToken,
      body: { device_id: deviceId },
    })
    assertEquals(second.status, 200)
    assertEquals(second.body.ok, true)
  } finally {
    await deleteTestUser(user.id)
  }
})

Deno.test('12. deactivate another user’s device → 404', async () => {
  const owner = await createTestUser(uniqueEmail('dev12o'))
  const attacker = await createTestUser(uniqueEmail('dev12x'))
  try {
    const deviceId = await seedDevice(owner.id, 'owned')

    const res = await callFn('devices/deactivate', {
      token: attacker.accessToken,
      body: { device_id: deviceId },
    })
    assertEquals(res.status, 404)

    // Owner's device is untouched.
    const { data: row } = await admin.from('devices').select('revoked_at').eq('id', deviceId).single()
    assertEquals(row!.revoked_at, null)
  } finally {
    await deleteTestUser(owner.id)
    await deleteTestUser(attacker.id)
  }
})
