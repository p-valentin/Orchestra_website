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
  // Epoch-seconds ceiling on exp. Trials pass their ends_at here so a token
  // can never outlive the trial: exp = min(iat + 7 days, notAfter).
  notAfter?: number
  // Epoch seconds the trial actually ends. Carried as its own claim because
  // `exp` cannot answer "how long is left": for the first week of a 14-day
  // trial exp is the 7-day token cap, so a countdown derived from it would
  // tell a day-1 user they have 7 days left. Signed, so the client can trust
  // it without asking.
  trialEndsAt?: number
}

export async function signEntitlementToken(
  privateKey: KeyLike,
  input: EntitlementInput,
): Promise<{ token: string; expiresAt: string }> {
  const iat = Math.floor(Date.now() / 1000)
  const exp = Math.min(iat + ENTITLEMENT_TTL_SECONDS, input.notAfter ?? Infinity)
  const token = await new SignJWT({
    dev: input.deviceId,
    plan: input.plan,
    status: 'active',
    ...(input.trialEndsAt !== undefined ? { trial_ends_at: input.trialEndsAt } : {}),
  })
    .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT', kid: ENTITLEMENT_KID })
    .setIssuer(ENTITLEMENT_ISSUER)
    .setAudience(ENTITLEMENT_AUDIENCE)
    .setSubject(input.userId)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(privateKey)
  return { token, expiresAt: new Date(exp * 1000).toISOString() }
}
