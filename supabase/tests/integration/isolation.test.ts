// Cross-user isolation, from the attacker's seat. The other suites prove each
// function does the right thing for its rightful caller; this one proves user
// B can never reach user A's data through any path — the "we don't want users
// to extract other users' data" invariant, made executable.
//
// The isolation model rests on four things, each exercised below:
//   1. Every Edge Function derives user.id from the verified JWT and scopes
//      every query to it (never from client-supplied ids).
//   2. RLS lets a client read only auth.uid()'s rows and write none.
//   3. Email auto-claim only fires for the caller's OWN account email — and in
//      production that email is confirmed (mailer_autoconfirm = false), so the
//      caller provably controls the inbox that a license was bought under.
//   4. A legacy token already bound to another account cannot be re-bound.

import { assert, assertEquals } from 'jsr:@std/assert@1'
import {
  adminClient,
  callFn,
  createTestUser,
  deleteTestUser,
  importLegacyPrivateKeyPkcs8B64,
  loadTestKeys,
  randomFingerprint,
  requireStack,
  seedLicense,
  signLegacyToken,
  uniqueEmail,
  userClient,
} from '../helpers.ts'

requireStack()
const admin = adminClient()
// The private key that pairs with the LEGACY_SIGNING_KEY the functions run
// with (same source claim-legacy.test.ts uses) so the token actually verifies.
const legacyKey = await importLegacyPrivateKeyPkcs8B64((await loadTestKeys()).legacyPrivateKeyPkcs8B64)

function body(fingerprint: string, extra: Record<string, unknown> = {}) {
  return { fingerprint, device_name: 'atk', platform: 'linux', app_version: '1.4.0', ...extra }
}

// The heart of Vali's concern: an unclaimed license bought under Alice's email
// must never attach to Bob just because Bob asked. Auto-claim keys on the
// caller's own JWT email, which nobody else can present.
Deno.test('isolation: a license bought for another email is never auto-claimed by the wrong user', async () => {
  const alice = uniqueEmail('iso-alice')
  const bob = await createTestUser(uniqueEmail('iso-bob'))
  const aliceLicense = await seedLicense({ buyer_email: alice, user_id: null })
  try {
    // Bob (a different, confirmed account) calls entitlement. He must get his
    // OWN trial, never Alice's lifetime license.
    const res = await callFn('entitlement', { token: bob.accessToken, body: body(randomFingerprint()) })
    assertEquals(res.status, 200)

    // Alice's license is untouched: still unclaimed, still active.
    const { data: lic } = await admin.from('licenses').select('user_id, status').eq('id', aliceLicense).single()
    assertEquals(lic!.user_id, null, 'Alice’s license must not have attached to Bob')
    assertEquals(lic!.status, 'active')

    // And Bob got a trial, not a lifetime plan — proof he fell through to the
    // trial path rather than picking up someone else's purchase.
    const { data: bobTrial } = await admin.from('trials').select('user_id').eq('user_id', bob.id).maybeSingle()
    assert(bobTrial !== null, 'Bob should be on his own trial')
    const { data: bobLic } = await admin.from('licenses').select('id').eq('user_id', bob.id)
    assertEquals(bobLic!.length, 0, 'Bob should hold no license')
  } finally {
    await admin.from('licenses').delete().eq('id', aliceLicense)
    await deleteTestUser(bob.id)
  }
})

// Client-supplied ids are never trusted: the caller's JWT decides scope. Bob
// cannot deactivate Alice's device even knowing its exact id, and it stays up.
Deno.test('isolation: user B cannot deactivate user A’s device (id is not a capability)', async () => {
  const alice = await createTestUser(uniqueEmail('iso-a'))
  const bob = await createTestUser(uniqueEmail('iso-b'))
  const { data: aliceDevice } = await admin
    .from('devices')
    .insert({ user_id: alice.id, fingerprint_hash: randomFingerprint(), name: 'alice-laptop' })
    .select('id').single()
  try {
    const res = await callFn('devices/deactivate', { token: bob.accessToken, body: { device_id: aliceDevice!.id } })
    // Someone else's id is indistinguishable from a nonexistent one: 404.
    assertEquals(res.status, 404)
    const { data: still } = await admin.from('devices').select('revoked_at').eq('id', aliceDevice!.id).single()
    assertEquals(still!.revoked_at, null, 'Alice’s device must remain active')

    // Bob's device list shows nothing of Alice's.
    const list = await callFn('devices', { method: 'GET', token: bob.accessToken })
    assertEquals(list.status, 200)
    assertEquals(list.body.devices.length, 0)
  } finally {
    await deleteTestUser(alice.id)
    await deleteTestUser(bob.id)
  }
})

// entitlement's device_limit listing is a place A's device data could leak into
// B's response. It must not: B's 409 (when full) lists only B's own devices.
Deno.test('isolation: entitlement never surfaces another user’s devices', async () => {
  const alice = await createTestUser(uniqueEmail('iso-la'))
  const bob = await createTestUser(uniqueEmail('iso-lb'))
  const bobLicense = await seedLicense({ buyer_email: bob.email, user_id: bob.id })
  // Alice fills three slots.
  for (let i = 0; i < 3; i++) {
    await admin.from('devices').insert({ user_id: alice.id, fingerprint_hash: randomFingerprint(), name: `alice-${i}` })
  }
  // Bob fills his own three, then a fourth to force the 409 listing.
  for (let i = 0; i < 3; i++) {
    await callFn('entitlement', { token: bob.accessToken, body: body(randomFingerprint(), { device_name: `bob-${i}` }) })
  }
  try {
    const res = await callFn('entitlement', { token: bob.accessToken, body: body(randomFingerprint(), { device_name: 'bob-4' }) })
    assertEquals(res.status, 409)
    assertEquals(res.body.error, 'device_limit')
    const names = res.body.devices.map((d: { name: string }) => d.name).sort()
    assertEquals(names, ['bob-0', 'bob-1', 'bob-2'], 'the listing must contain only Bob’s devices')
  } finally {
    await admin.from('licenses').delete().eq('id', bobLicense)
    await deleteTestUser(alice.id)
    await deleteTestUser(bob.id)
  }
})

// A legacy token already redeemed by Alice cannot be hijacked by Bob, even
// though legacy claims intentionally don't require an email match.
Deno.test('isolation: a legacy token bound to user A cannot be re-claimed by user B', async () => {
  const alice = await createTestUser(uniqueEmail('iso-lt-a'))
  const bob = await createTestUser(uniqueEmail('iso-lt-b'))
  const token = await signLegacyToken(
    { email: alice.email, plan: 'lifetime', issuedAt: Date.now() },
    legacyKey,
  )
  try {
    const first = await callFn('claim-legacy', { token: alice.accessToken, body: { legacy_token: token } })
    assertEquals(first.status, 200)

    // Bob presents the very same token. It's already bound to Alice → 409.
    const second = await callFn('claim-legacy', { token: bob.accessToken, body: { legacy_token: token } })
    assertEquals(second.status, 409)
    assertEquals(second.body.error, 'already_claimed')

    // The license is still Alice's.
    const { data: rows } = await admin.from('licenses').select('user_id').eq('buyer_email', alice.email)
    assertEquals(rows!.length, 1)
    assertEquals(rows![0].user_id, alice.id)
  } finally {
    await admin.from('licenses').delete().eq('buyer_email', alice.email)
    await deleteTestUser(alice.id)
    await deleteTestUser(bob.id)
  }
})

// Direct PostgREST access under B's token: B cannot even see A exists, and
// cannot write anything. (Broader RLS coverage lives in rls.test.ts; this
// re-asserts the cross-user read at the isolation boundary for completeness.)
Deno.test('isolation: direct table reads under B’s token never return A’s rows', async () => {
  const alice = await createTestUser(uniqueEmail('iso-d-a'))
  const bob = await createTestUser(uniqueEmail('iso-d-b'))
  const aliceLicense = await seedLicense({ buyer_email: alice.email, user_id: alice.id })
  await admin.from('devices').insert({ user_id: alice.id, fingerprint_hash: randomFingerprint(), name: 'a' })
  await admin.from('trials').insert({
    user_id: alice.id, ends_at: new Date(Date.now() + 8.64e7).toISOString(), starting_fingerprint: randomFingerprint(),
  })
  try {
    const asBob = userClient(bob.accessToken)
    assertEquals((await asBob.from('licenses').select('id')).data!.length, 0)
    assertEquals((await asBob.from('devices').select('id')).data!.length, 0)
    assertEquals((await asBob.from('trials').select('user_id')).data!.length, 0)
    // Targeted by A's exact license id: still nothing.
    assertEquals((await asBob.from('licenses').select('id').eq('id', aliceLicense)).data!.length, 0)
  } finally {
    await admin.from('licenses').delete().eq('id', aliceLicense)
    await deleteTestUser(alice.id)
    await deleteTestUser(bob.id)
  }
})
