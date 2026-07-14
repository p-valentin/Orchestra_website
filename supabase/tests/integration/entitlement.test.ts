// §8 cases 1–9: POST /entitlement against a running local stack.
// Prereqs: supabase start && supabase functions serve --env-file supabase/functions/.env.test
// (generate the env file first: deno run -A scripts/setup-test-env.ts)

import { assert, assertEquals, assertExists } from 'jsr:@std/assert@1'
import { importJWK, jwtVerify } from 'npm:jose@5.9.6'
import {
  adminClient,
  callFn,
  createTestUser,
  deleteTestUser,
  loadTestKeys,
  randomFingerprint,
  requireStack,
  seedLicense,
  uniqueEmail,
} from '../helpers.ts'
import {
  ENTITLEMENT_AUDIENCE,
  ENTITLEMENT_ISSUER,
  ENTITLEMENT_TTL_SECONDS,
} from '../../functions/_shared/entitlement-token.ts'

requireStack()
const admin = adminClient()

function entitlementBody(fingerprint: string, extra: Record<string, unknown> = {}) {
  return {
    fingerprint,
    device_name: 'Vali-PC',
    platform: 'windows',
    app_version: '1.4.0',
    ...extra,
  }
}

async function cleanup(userIds: string[], licenseIds: string[]) {
  for (const id of licenseIds) await admin.from('licenses').delete().eq('id', id)
  for (const id of userIds) await deleteTestUser(id)
}

Deno.test('1. no license → Phase 1.5 amends §8.1: a trial starts instead of 403 no_license', async () => {
  // The original case ("no license → 403 no_license") was superseded by the
  // Phase 1.5 addendum §3: a user with no license in any status now enters
  // the trial path (full coverage in trials.test.ts cases 22–28). This test
  // pins the amendment itself: the no_license error is retired.
  const user = await createTestUser(uniqueEmail('ent1'))
  try {
    const res = await callFn('entitlement', { token: user.accessToken, body: entitlementBody(randomFingerprint()) })
    assertEquals(res.status, 200)

    const keys = await loadTestKeys()
    const publicKey = await importJWK(keys.entitlementPublicJwk, 'EdDSA')
    const { payload } = await jwtVerify(res.body.token, publicKey, {
      issuer: ENTITLEMENT_ISSUER,
      audience: ENTITLEMENT_AUDIENCE,
    })
    assertEquals(payload.plan, 'trial')
  } finally {
    await cleanup([user.id], [])
  }
})

Deno.test('2. unclaimed license with matching email → auto-claimed, 200 with valid token', async () => {
  const email = uniqueEmail('ent2')
  const user = await createTestUser(email)
  const licenseId = await seedLicense({ buyer_email: email, user_id: null })
  try {
    const res = await callFn('entitlement', { token: user.accessToken, body: entitlementBody(randomFingerprint()) })
    assertEquals(res.status, 200)
    assertExists(res.body.token)
    assertExists(res.body.expires_at)

    const { data: lic } = await admin.from('licenses').select('*').eq('id', licenseId).single()
    assertEquals(lic!.user_id, user.id)
    assertExists(lic!.claimed_at)
  } finally {
    await cleanup([user.id], [licenseId])
  }
})

Deno.test('3a. refunded license → 403 license_refunded', async () => {
  const email = uniqueEmail('ent3a')
  const user = await createTestUser(email)
  const licenseId = await seedLicense({ buyer_email: email, user_id: user.id, status: 'refunded' })
  try {
    const res = await callFn('entitlement', { token: user.accessToken, body: entitlementBody(randomFingerprint()) })
    assertEquals(res.status, 403)
    assertEquals(res.body.error, 'license_refunded')
  } finally {
    await cleanup([user.id], [licenseId])
  }
})

Deno.test('3b. revoked license → 403 license_revoked', async () => {
  const email = uniqueEmail('ent3b')
  const user = await createTestUser(email)
  const licenseId = await seedLicense({ buyer_email: email, user_id: user.id, status: 'revoked' })
  try {
    const res = await callFn('entitlement', { token: user.accessToken, body: entitlementBody(randomFingerprint()) })
    assertEquals(res.status, 403)
    assertEquals(res.body.error, 'license_revoked')
  } finally {
    await cleanup([user.id], [licenseId])
  }
})

Deno.test('4. new device with 0–2 active devices → 200, device row created', async () => {
  const email = uniqueEmail('ent4')
  const user = await createTestUser(email)
  const licenseId = await seedLicense({ buyer_email: email, user_id: user.id })
  try {
    for (let i = 0; i < 3; i++) {
      const fp = randomFingerprint()
      const res = await callFn('entitlement', {
        token: user.accessToken,
        body: entitlementBody(fp, { device_name: `PC-${i}` }),
      })
      assertEquals(res.status, 200, `activation ${i + 1} should succeed`)

      const { data: device } = await admin
        .from('devices').select('*').eq('user_id', user.id).eq('fingerprint_hash', fp).single()
      assertExists(device)
      assertEquals(device!.name, `PC-${i}`)
      assertEquals(device!.platform, 'windows')
      assertEquals(device!.revoked_at, null)
    }
    const { data: all } = await admin.from('devices').select('id').eq('user_id', user.id)
    assertEquals(all!.length, 3)
  } finally {
    await cleanup([user.id], [licenseId])
  }
})

Deno.test('5. 4th device activation → 409 device_limit listing the 3 active devices', async () => {
  const email = uniqueEmail('ent5')
  const user = await createTestUser(email)
  const licenseId = await seedLicense({ buyer_email: email, user_id: user.id })
  try {
    for (let i = 0; i < 3; i++) {
      const ok = await callFn('entitlement', { token: user.accessToken, body: entitlementBody(randomFingerprint()) })
      assertEquals(ok.status, 200)
    }
    const res = await callFn('entitlement', { token: user.accessToken, body: entitlementBody(randomFingerprint()) })
    assertEquals(res.status, 409)
    assertEquals(res.body.error, 'device_limit')
    assertEquals(res.body.devices.length, 3)
    for (const d of res.body.devices) {
      assertExists(d.id)
      assertExists(d.last_seen_at)
      assert('name' in d && 'platform' in d)
    }
    // No 4th row was created.
    const { data: all } = await admin.from('devices').select('id').eq('user_id', user.id)
    assertEquals(all!.length, 3)
  } finally {
    await cleanup([user.id], [licenseId])
  }
})

Deno.test('6. same device re-requests → 200, no duplicate row, last_seen_at updated', async () => {
  const email = uniqueEmail('ent6')
  const user = await createTestUser(email)
  const licenseId = await seedLicense({ buyer_email: email, user_id: user.id })
  const fp = randomFingerprint()
  try {
    const first = await callFn('entitlement', { token: user.accessToken, body: entitlementBody(fp) })
    assertEquals(first.status, 200)
    const { data: before } = await admin
      .from('devices').select('*').eq('user_id', user.id).eq('fingerprint_hash', fp).single()

    await new Promise((r) => setTimeout(r, 150))
    const second = await callFn('entitlement', {
      token: user.accessToken,
      body: entitlementBody(fp, { app_version: '1.5.0' }),
    })
    assertEquals(second.status, 200)

    const { data: rows } = await admin
      .from('devices').select('*').eq('user_id', user.id).eq('fingerprint_hash', fp)
    assertEquals(rows!.length, 1)
    assert(new Date(rows![0].last_seen_at) > new Date(before!.last_seen_at))
    assertEquals(rows![0].app_version, '1.5.0')
  } finally {
    await cleanup([user.id], [licenseId])
  }
})

Deno.test('7. deactivated device frees a slot → next new device activates', async () => {
  const email = uniqueEmail('ent7')
  const user = await createTestUser(email)
  const licenseId = await seedLicense({ buyer_email: email, user_id: user.id })
  try {
    const fps = [randomFingerprint(), randomFingerprint(), randomFingerprint()]
    for (const fp of fps) {
      const ok = await callFn('entitlement', { token: user.accessToken, body: entitlementBody(fp) })
      assertEquals(ok.status, 200)
    }
    const { data: victim } = await admin
      .from('devices').select('id').eq('user_id', user.id).eq('fingerprint_hash', fps[0]).single()
    const deact = await callFn('devices/deactivate', {
      token: user.accessToken,
      body: { device_id: victim!.id },
    })
    assertEquals(deact.status, 200)

    const res = await callFn('entitlement', { token: user.accessToken, body: entitlementBody(randomFingerprint()) })
    assertEquals(res.status, 200)
    const { data: active } = await admin
      .from('devices').select('id').eq('user_id', user.id).is('revoked_at', null)
    assertEquals(active!.length, 3)
  } finally {
    await cleanup([user.id], [licenseId])
  }
})

Deno.test('8. returned JWT: EdDSA, verifies with public key, 7-day life, sub/dev match DB', async () => {
  const email = uniqueEmail('ent8')
  const user = await createTestUser(email)
  const licenseId = await seedLicense({ buyer_email: email, user_id: user.id })
  const fp = randomFingerprint()
  try {
    const res = await callFn('entitlement', { token: user.accessToken, body: entitlementBody(fp) })
    assertEquals(res.status, 200)

    const keys = await loadTestKeys()
    const publicKey = await importJWK(keys.entitlementPublicJwk, 'EdDSA')
    const { payload, protectedHeader } = await jwtVerify(res.body.token, publicKey, {
      issuer: ENTITLEMENT_ISSUER,
      audience: ENTITLEMENT_AUDIENCE,
    })
    assertEquals(protectedHeader.alg, 'EdDSA')
    assertExists(protectedHeader.kid)
    assertEquals(payload.exp! - payload.iat!, ENTITLEMENT_TTL_SECONDS)
    assertEquals(payload.plan, 'lifetime')
    assertEquals(payload.status, 'active')

    assertEquals(payload.sub, user.id)
    const { data: device } = await admin
      .from('devices').select('id').eq('user_id', user.id).eq('fingerprint_hash', fp).single()
    assertEquals(payload.dev, device!.id)
    assertEquals(Date.parse(res.body.expires_at), payload.exp! * 1000)
  } finally {
    await cleanup([user.id], [licenseId])
  }
})

Deno.test('7b. revoked device reactivates into a free slot; never into a full one', async () => {
  const email = uniqueEmail('ent7b')
  const user = await createTestUser(email)
  const licenseId = await seedLicense({ buyer_email: email, user_id: user.id })
  const fpA = randomFingerprint()
  try {
    // Activate A, revoke it, and let it come back while slots are free:
    // same row, revoked_at cleared.
    const first = await callFn('entitlement', { token: user.accessToken, body: entitlementBody(fpA) })
    assertEquals(first.status, 200)
    const { data: deviceA } = await admin
      .from('devices').select('id').eq('user_id', user.id).eq('fingerprint_hash', fpA).single()
    await callFn('devices/deactivate', { token: user.accessToken, body: { device_id: deviceA!.id } })

    const back = await callFn('entitlement', { token: user.accessToken, body: entitlementBody(fpA) })
    assertEquals(back.status, 200)
    const { data: rowsA } = await admin
      .from('devices').select('id, revoked_at').eq('user_id', user.id).eq('fingerprint_hash', fpA)
    assertEquals(rowsA!.length, 1)
    assertEquals(rowsA![0].id, deviceA!.id)
    assertEquals(rowsA![0].revoked_at, null)

    // Fill the house without A (revoke A, add B/C/D), then A's return must 409
    // and its revoked_at must survive — reactivation never steals a slot.
    await callFn('devices/deactivate', { token: user.accessToken, body: { device_id: deviceA!.id } })
    for (let i = 0; i < 3; i++) {
      const ok = await callFn('entitlement', { token: user.accessToken, body: entitlementBody(randomFingerprint()) })
      assertEquals(ok.status, 200)
    }
    const blocked = await callFn('entitlement', { token: user.accessToken, body: entitlementBody(fpA) })
    assertEquals(blocked.status, 409)
    assertEquals(blocked.body.error, 'device_limit')
    const { data: stillRevoked } = await admin.from('devices').select('revoked_at').eq('id', deviceA!.id).single()
    assert(stillRevoked!.revoked_at !== null)
  } finally {
    await cleanup([user.id], [licenseId])
  }
})

Deno.test('input validation: malformed fingerprint → 400 invalid_request', async () => {
  const email = uniqueEmail('entfp')
  const user = await createTestUser(email)
  const licenseId = await seedLicense({ buyer_email: email, user_id: user.id })
  try {
    for (const bad of ['', 'short', 'not-a-sha256-hex-fingerprint', 'g'.repeat(64), 42, null]) {
      const res = await callFn('entitlement', {
        token: user.accessToken,
        body: { ...entitlementBody(randomFingerprint()), fingerprint: bad },
      })
      assertEquals(res.status, 400, `should 400 for fingerprint: ${JSON.stringify(bad)}`)
      assertEquals(res.body.error, 'invalid_request')
    }
  } finally {
    await cleanup([user.id], [licenseId])
  }
})

Deno.test('9. missing or invalid auth JWT → 401', async () => {
  const noAuth = await callFn('entitlement', { body: entitlementBody(randomFingerprint()) })
  assertEquals(noAuth.status, 401)

  const badAuth = await callFn('entitlement', {
    token: 'not-a-real-jwt',
    body: entitlementBody(randomFingerprint()),
  })
  assertEquals(badAuth.status, 401)
})
