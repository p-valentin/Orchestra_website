// §8 cases 19–20: RLS isolation. Clients may read only their own rows and can
// never write license tables directly — all writes go through Edge Functions
// with the service role.

import { assert, assertEquals } from 'jsr:@std/assert@1'
import {
  adminClient,
  createTestUser,
  deleteTestUser,
  randomFingerprint,
  requireStack,
  seedLicense,
  uniqueEmail,
  userClient,
} from '../helpers.ts'

requireStack()
const admin = adminClient()

Deno.test('19. user A cannot read user B’s licenses or devices', async () => {
  const userA = await createTestUser(uniqueEmail('rls19a'))
  const userB = await createTestUser(uniqueEmail('rls19b'))
  const licenseA = await seedLicense({ buyer_email: userA.email, user_id: userA.id })
  const licenseB = await seedLicense({ buyer_email: userB.email, user_id: userB.id })
  const { data: deviceB } = await admin
    .from('devices')
    .insert({ user_id: userB.id, fingerprint_hash: randomFingerprint(), name: 'B-device' })
    .select('id').single()
  try {
    const asA = userClient(userA.accessToken)

    // A sees exactly A's license, never B's.
    const { data: licenses, error: licErr } = await asA.from('licenses').select('id, user_id')
    assertEquals(licErr, null)
    assertEquals(licenses!.map((l) => l.id), [licenseA])

    const { data: byId } = await asA.from('licenses').select('id').eq('id', licenseB)
    assertEquals(byId!.length, 0)

    // A sees no devices at all (only B has one).
    const { data: devices } = await asA.from('devices').select('id')
    assertEquals(devices!.length, 0)
    const { data: devById } = await asA.from('devices').select('id').eq('id', deviceB!.id)
    assertEquals(devById!.length, 0)
  } finally {
    await admin.from('licenses').delete().in('id', [licenseA, licenseB])
    await deleteTestUser(userA.id)
    await deleteTestUser(userB.id)
  }
})

Deno.test('20. authenticated role cannot INSERT/UPDATE/DELETE licenses or devices', async () => {
  const user = await createTestUser(uniqueEmail('rls20'))
  const licenseId = await seedLicense({ buyer_email: user.email, user_id: user.id })
  const { data: device } = await admin
    .from('devices')
    .insert({ user_id: user.id, fingerprint_hash: randomFingerprint(), name: 'mine' })
    .select('id').single()
  try {
    const asUser = userClient(user.accessToken)

    // INSERT: rejected outright (no policy).
    const licIns = await asUser.from('licenses').insert({
      buyer_email: user.email,
      ls_order_id: `forged-${crypto.randomUUID()}`,
    })
    assert(licIns.error !== null, 'license INSERT must be rejected')
    const devIns = await asUser.from('devices').insert({
      user_id: user.id,
      fingerprint_hash: randomFingerprint(),
    })
    assert(devIns.error !== null, 'device INSERT must be rejected')

    // UPDATE: affects zero rows even on the user's own visible rows.
    const licUpd = await asUser.from('licenses').update({ status: 'revoked' }).eq('id', licenseId).select()
    assertEquals(licUpd.data ?? [], [])
    const { data: licAfter } = await admin.from('licenses').select('status').eq('id', licenseId).single()
    assertEquals(licAfter!.status, 'active')

    const devUpd = await asUser.from('devices').update({ revoked_at: null, name: 'hacked' }).eq('id', device!.id).select()
    assertEquals(devUpd.data ?? [], [])
    const { data: devAfter } = await admin.from('devices').select('name').eq('id', device!.id).single()
    assertEquals(devAfter!.name, 'mine')

    // DELETE: affects zero rows.
    const licDel = await asUser.from('licenses').delete().eq('id', licenseId).select()
    assertEquals(licDel.data ?? [], [])
    const { data: licStill } = await admin.from('licenses').select('id').eq('id', licenseId)
    assertEquals(licStill!.length, 1)

    const devDel = await asUser.from('devices').delete().eq('id', device!.id).select()
    assertEquals(devDel.data ?? [], [])
    const { data: devStill } = await admin.from('devices').select('id').eq('id', device!.id)
    assertEquals(devStill!.length, 1)
  } finally {
    await admin.from('licenses').delete().eq('id', licenseId)
    await deleteTestUser(user.id)
  }
})
