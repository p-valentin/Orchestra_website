// Phase 1.5 §4 cases 22–28: the self-managed 14-day trial inside /entitlement.
// Same prereqs as the rest of the integration suite (see helpers.ts).

import { assert, assertEquals, assertExists } from 'jsr:@std/assert@1'
import { importJWK, jwtVerify, type JWTPayload } from 'npm:jose@5.9.6'
import {
  adminClient,
  callFn,
  createTestUser,
  deleteTestUser,
  loadTestKeys,
  randomFingerprint,
  requireStack,
  seedLicense,
  seedTrial,
  uniqueEmail,
  userClient,
} from '../helpers.ts'
import {
  ENTITLEMENT_AUDIENCE,
  ENTITLEMENT_ISSUER,
  ENTITLEMENT_TTL_SECONDS,
} from '../../functions/_shared/entitlement-token.ts'

requireStack()
const admin = adminClient()
const DAY_S = 24 * 60 * 60

function entitlementBody(fingerprint: string) {
  return { fingerprint, device_name: 'Trial-PC', platform: 'linux', app_version: '1.5.0' }
}

async function verifyJwt(token: string): Promise<JWTPayload> {
  const keys = await loadTestKeys()
  const publicKey = await importJWK(keys.entitlementPublicJwk, 'EdDSA')
  const { payload } = await jwtVerify(token, publicKey, {
    issuer: ENTITLEMENT_ISSUER,
    audience: ENTITLEMENT_AUDIENCE,
  })
  return payload
}

Deno.test('22. first call, no license/no trial → trial row created, plan=trial, exp ≤ ends_at', async () => {
  const user = await createTestUser(uniqueEmail('tr22'))
  const fp = randomFingerprint()
  try {
    const res = await callFn('entitlement', { token: user.accessToken, body: entitlementBody(fp) })
    assertEquals(res.status, 200)

    const payload = await verifyJwt(res.body.token)
    assertEquals(payload.plan, 'trial')
    assertEquals(payload.status, 'active')

    const { data: trial } = await admin.from('trials').select('*').eq('user_id', user.id).single()
    assertExists(trial)
    assertEquals(trial!.starting_fingerprint, fp)
    const endsAtS = Math.floor(Date.parse(trial!.ends_at) / 1000)
    const startedAtS = Math.floor(Date.parse(trial!.started_at) / 1000)
    assert(Math.abs(endsAtS - startedAtS - 14 * DAY_S) <= 5, 'trial lasts 14 days')

    // Fresh trial: the 7-day token cap is the binding one, and never past ends_at.
    assert(payload.exp! <= endsAtS)
    assertEquals(payload.exp! - payload.iat!, ENTITLEMENT_TTL_SECONDS)
  } finally {
    await deleteTestUser(user.id) // trials row cascades
  }
})

Deno.test('23. trial 13 days in → token exp equals ends_at, not iat+7d', async () => {
  const user = await createTestUser(uniqueEmail('tr23'))
  const trial = await seedTrial(user.id, { startedDaysAgo: 13 })
  try {
    const res = await callFn('entitlement', { token: user.accessToken, body: entitlementBody(randomFingerprint()) })
    assertEquals(res.status, 200)

    const payload = await verifyJwt(res.body.token)
    assertEquals(payload.plan, 'trial')
    assertEquals(payload.exp, Math.floor(Date.parse(trial.ends_at) / 1000))
    assert(payload.exp! - payload.iat! < ENTITLEMENT_TTL_SECONDS, 'cap beat the 7-day TTL')
    assertEquals(Date.parse(res.body.expires_at), payload.exp! * 1000)
  } finally {
    await deleteTestUser(user.id)
  }
})

Deno.test('24. trial expired → 403 trial_expired', async () => {
  const user = await createTestUser(uniqueEmail('tr24'))
  await seedTrial(user.id, { startedDaysAgo: 15 })
  try {
    const res = await callFn('entitlement', { token: user.accessToken, body: entitlementBody(randomFingerprint()) })
    assertEquals(res.status, 403)
    assertEquals(res.body.error, 'trial_expired')
  } finally {
    await deleteTestUser(user.id)
  }
})

Deno.test('25. fingerprint that started a trial on another account → 403 trial_unavailable, no row', async () => {
  const first = await createTestUser(uniqueEmail('tr25a'))
  const second = await createTestUser(uniqueEmail('tr25b'))
  const sharedFp = randomFingerprint()
  await seedTrial(first.id, { fingerprint: sharedFp })
  try {
    const res = await callFn('entitlement', { token: second.accessToken, body: entitlementBody(sharedFp) })
    assertEquals(res.status, 403)
    assertEquals(res.body.error, 'trial_unavailable')

    const { data: rows } = await admin.from('trials').select('user_id').eq('user_id', second.id)
    assertEquals(rows!.length, 0)

    // A different device is still fine for the second account.
    const fresh = await callFn('entitlement', { token: second.accessToken, body: entitlementBody(randomFingerprint()) })
    assertEquals(fresh.status, 200)
  } finally {
    await deleteTestUser(first.id)
    await deleteTestUser(second.id)
  }
})

Deno.test('26. purchase during active trial → plan=lifetime, trial row untouched', async () => {
  const email = uniqueEmail('tr26')
  const user = await createTestUser(email)
  const trial = await seedTrial(user.id, { startedDaysAgo: 3 })
  const licenseId = await seedLicense({ buyer_email: email, user_id: user.id })
  try {
    const res = await callFn('entitlement', { token: user.accessToken, body: entitlementBody(randomFingerprint()) })
    assertEquals(res.status, 200)

    const payload = await verifyJwt(res.body.token)
    assertEquals(payload.plan, 'lifetime')
    // Lifetime token gets the full 7 days — no trial cap.
    assertEquals(payload.exp! - payload.iat!, ENTITLEMENT_TTL_SECONDS)

    const { data: after } = await admin.from('trials').select('ends_at').eq('user_id', user.id).single()
    assertEquals(after!.ends_at, trial.ends_at)
  } finally {
    await admin.from('licenses').delete().eq('id', licenseId)
    await deleteTestUser(user.id)
  }
})

Deno.test('27. refunded license, no trial row → 403 license_refunded, no trial granted', async () => {
  const email = uniqueEmail('tr27')
  const user = await createTestUser(email)
  const licenseId = await seedLicense({ buyer_email: email, user_id: user.id, status: 'refunded' })
  try {
    const res = await callFn('entitlement', { token: user.accessToken, body: entitlementBody(randomFingerprint()) })
    assertEquals(res.status, 403)
    assertEquals(res.body.error, 'license_refunded')

    const { data: rows } = await admin.from('trials').select('user_id').eq('user_id', user.id)
    assertEquals(rows!.length, 0, 'a refunded purchase must not re-grant a trial')
  } finally {
    await admin.from('licenses').delete().eq('id', licenseId)
    await deleteTestUser(user.id)
  }
})

Deno.test('28. refunded license + expired trial → 403 license_refunded (license wins)', async () => {
  const email = uniqueEmail('tr28')
  const user = await createTestUser(email)
  await seedTrial(user.id, { startedDaysAgo: 20 })
  const licenseId = await seedLicense({ buyer_email: email, user_id: user.id, status: 'refunded' })
  try {
    const res = await callFn('entitlement', { token: user.accessToken, body: entitlementBody(randomFingerprint()) })
    assertEquals(res.status, 403)
    assertEquals(res.body.error, 'license_refunded')
  } finally {
    await admin.from('licenses').delete().eq('id', licenseId)
    await deleteTestUser(user.id)
  }
})

Deno.test('RLS: a user reads only their own trial row; no client writes', async () => {
  const owner = await createTestUser(uniqueEmail('trRlsA'))
  const other = await createTestUser(uniqueEmail('trRlsB'))
  await seedTrial(owner.id, {})
  try {
    const asOther = userClient(other.accessToken)
    const { data: visible, error } = await asOther.from('trials').select('user_id')
    assertEquals(error, null)
    assertEquals(visible!.length, 0)

    const ins = await asOther.from('trials').insert({
      user_id: other.id,
      ends_at: new Date(Date.now() + 999 * 24 * 3600 * 1000).toISOString(),
      starting_fingerprint: randomFingerprint(),
    })
    assert(ins.error !== null, 'client INSERT into trials must be rejected')

    const asOwner = userClient(owner.accessToken)
    const { data: own } = await asOwner.from('trials').select('user_id')
    assertEquals(own!.map((r) => r.user_id), [owner.id])
  } finally {
    await deleteTestUser(owner.id)
    await deleteTestUser(other.id)
  }
})
