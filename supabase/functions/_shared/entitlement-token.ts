// Entitlement JWT signing. Standard JWT, alg EdDSA (Ed25519), 7-day life.
//
// Design principle §2.1: the license check never sits in the workflow
// execution path. The desktop client verifies this token offline with the
// embedded public key, so server downtime inside the 7-day window never
// blocks a paying customer.

import { importPKCS8, SignJWT, type KeyLike } from 'npm:jose@5.9.6'
import { pemFromEnvValue } from './util.ts'

export const ENTITLEMENT_ISSUER = 'orchestra-license'
export const ENTITLEMENT_AUDIENCE = 'orchestra-desktop'
export const ENTITLEMENT_KID = '2026-07' // header kid, for future key rotation
export const ENTITLEMENT_TTL_SECONDS = 7 * 24 * 60 * 60

// ENTITLEMENT_PRIVATE_KEY is a PKCS8 PEM (or base64 of one) in Supabase secrets.
export async function importEntitlementPrivateKey(envValue: string): Promise<KeyLike> {
  return await importPKCS8(pemFromEnvValue(envValue), 'EdDSA')
}

export interface EntitlementInput {
  userId: string
  deviceId: string
  plan: string
}

export async function signEntitlementToken(
  privateKey: KeyLike,
  input: EntitlementInput,
): Promise<{ token: string; expiresAt: string }> {
  const iat = Math.floor(Date.now() / 1000)
  const exp = iat + ENTITLEMENT_TTL_SECONDS
  const token = await new SignJWT({ dev: input.deviceId, plan: input.plan, status: 'active' })
    .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT', kid: ENTITLEMENT_KID })
    .setIssuer(ENTITLEMENT_ISSUER)
    .setAudience(ENTITLEMENT_AUDIENCE)
    .setSubject(input.userId)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(privateKey)
  return { token, expiresAt: new Date(exp * 1000).toISOString() }
}
