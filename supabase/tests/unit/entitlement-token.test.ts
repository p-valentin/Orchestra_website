// Unit tests for entitlement JWT signing (no Supabase stack needed).
// Pure-logic half of §8 case 8: EdDSA alg, kid, 7-day lifetime, claims.
//
// Run: deno test -A supabase/tests/unit

import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { exportJWK, generateKeyPair, jwtVerify } from 'npm:jose@5.9.6'
import {
  ENTITLEMENT_AUDIENCE,
  ENTITLEMENT_ISSUER,
  ENTITLEMENT_KID,
  ENTITLEMENT_TTL_SECONDS,
  signEntitlementToken,
} from '../../functions/_shared/entitlement-token.ts'

const { publicKey, privateKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true })
const userId = crypto.randomUUID()
const deviceId = crypto.randomUUID()

Deno.test('token verifies against the public key with expected claims', async () => {
  const { token, expiresAt } = await signEntitlementToken(privateKey, {
    userId,
    deviceId,
    plan: 'lifetime',
  })
  const { payload, protectedHeader } = await jwtVerify(token, publicKey, {
    issuer: ENTITLEMENT_ISSUER,
    audience: ENTITLEMENT_AUDIENCE,
  })

  assertEquals(protectedHeader.alg, 'EdDSA')
  assertEquals(protectedHeader.typ, 'JWT')
  assertEquals(protectedHeader.kid, ENTITLEMENT_KID)

  assertEquals(payload.sub, userId)
  assertEquals(payload.dev, deviceId)
  assertEquals(payload.plan, 'lifetime')
  assertEquals(payload.status, 'active')
  assert(typeof payload.iat === 'number' && typeof payload.exp === 'number')
  assertEquals(payload.exp - payload.iat, ENTITLEMENT_TTL_SECONDS)
  assertEquals(ENTITLEMENT_TTL_SECONDS, 7 * 24 * 60 * 60)

  // expires_at in the response is the same instant as the JWT exp claim.
  assertEquals(Date.parse(expiresAt), payload.exp * 1000)
})

Deno.test('token is a standard JWT verifiable via exported JWK', async () => {
  // Phase 3 embeds the public key as a JWK in the desktop client; make sure
  // the round trip works.
  const { token } = await signEntitlementToken(privateKey, { userId, deviceId, plan: 'lifetime' })
  const jwk = await exportJWK(publicKey)
  const { importJWK } = await import('npm:jose@5.9.6')
  const key = await importJWK(jwk, 'EdDSA')
  const { payload } = await jwtVerify(token, key, {
    issuer: ENTITLEMENT_ISSUER,
    audience: ENTITLEMENT_AUDIENCE,
  })
  assertEquals(payload.sub, userId)
})

Deno.test('notAfter beyond 7 days does not extend the token', async () => {
  const farFuture = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
  const { token } = await signEntitlementToken(privateKey, {
    userId,
    deviceId,
    plan: 'trial',
    notAfter: farFuture,
  })
  const { payload } = await jwtVerify(token, publicKey, {
    issuer: ENTITLEMENT_ISSUER,
    audience: ENTITLEMENT_AUDIENCE,
  })
  assertEquals(payload.exp! - payload.iat!, ENTITLEMENT_TTL_SECONDS)
})

Deno.test('notAfter inside 7 days caps the token — it never outlives the trial', async () => {
  const soon = Math.floor(Date.now() / 1000) + 24 * 60 * 60 // 1 day out
  const { token, expiresAt } = await signEntitlementToken(privateKey, {
    userId,
    deviceId,
    plan: 'trial',
    notAfter: soon,
  })
  const { payload } = await jwtVerify(token, publicKey, {
    issuer: ENTITLEMENT_ISSUER,
    audience: ENTITLEMENT_AUDIENCE,
  })
  assertEquals(payload.exp, soon)
  assertEquals(Date.parse(expiresAt), soon * 1000)
})

Deno.test('trial tokens carry the real trial end, separate from exp', async () => {
  // exp is capped at 7 days, so it cannot answer "how long is left" for a
  // 14-day trial. The client needs the real end, signed.
  const trialEndsAt = Math.floor(Date.now() / 1000) + 14 * 24 * 3600
  const { token } = await signEntitlementToken(privateKey, {
    userId,
    deviceId,
    plan: 'trial',
    notAfter: trialEndsAt,
    trialEndsAt,
  })
  const { payload } = await jwtVerify(token, publicKey, {
    issuer: ENTITLEMENT_ISSUER,
    audience: ENTITLEMENT_AUDIENCE,
  })
  assertEquals(payload.trial_ends_at, trialEndsAt)
  // The token itself still dies in 7 days — the offline window is unchanged.
  assertEquals(payload.exp! - payload.iat!, ENTITLEMENT_TTL_SECONDS)
})

Deno.test('lifetime tokens carry no trial claim', async () => {
  const { token } = await signEntitlementToken(privateKey, { userId, deviceId, plan: 'lifetime' })
  const { payload } = await jwtVerify(token, publicKey, {
    issuer: ENTITLEMENT_ISSUER,
    audience: ENTITLEMENT_AUDIENCE,
  })
  assertEquals('trial_ends_at' in payload, false)
})

Deno.test('token does not verify against a different key', async () => {
  const other = await generateKeyPair('EdDSA', { crv: 'Ed25519' })
  const { token } = await signEntitlementToken(privateKey, { userId, deviceId, plan: 'lifetime' })
  await assertRejects(() =>
    jwtVerify(token, other.publicKey, {
      issuer: ENTITLEMENT_ISSUER,
      audience: ENTITLEMENT_AUDIENCE,
    })
  )
})
