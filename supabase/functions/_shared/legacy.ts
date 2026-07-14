// Verification of Orchestra's legacy license keys.
//
// Issuing side (the website's lib/token.ts): Ed25519 over the UTF-8 bytes of
// the base64url-encoded payload JSON, token = `${body}.${base64url(sig)}`.
// Payload: { email, plan, issuedAt } — issuedAt in epoch MILLISECONDS.
//
// The same key also signs short-lived app refresh tokens whose payload carries
// an extra `exp` field (and `plan: 'trial'` for trial users). Those are NOT
// proof of purchase, so verification rejects any payload with `exp` or a plan
// other than 'lifetime'. Tokens are secrets: never store or log them raw —
// callers persist sha256Hex(token) only (see util.ts).

import { base64UrlToBytes, normalizeEmail, pemFromEnvValue, pemToDer } from './util.ts'

export interface LegacyClaim {
  email: string // normalized
  issuedAt: number // epoch ms
}

export type LegacyResult = { ok: true; claim: LegacyClaim } | { ok: false }

const INVALID: LegacyResult = { ok: false }

// LEGACY_SIGNING_KEY is the Ed25519 PUBLIC key (SPKI PEM, or base64 of it) —
// verification never needs the website's private key.
export async function importLegacyPublicKey(envValue: string): Promise<CryptoKey> {
  const der = pemToDer(pemFromEnvValue(envValue))
  return await crypto.subtle.importKey('spki', der.buffer as ArrayBuffer, 'Ed25519', false, ['verify'])
}

export async function verifyLegacyToken(token: string, publicKey: CryptoKey): Promise<LegacyResult> {
  try {
    if (typeof token !== 'string' || token.length === 0 || token.length > 4096) return INVALID
    const parts = token.split('.')
    if (parts.length !== 2) return INVALID
    const [body, sig] = parts
    if (!body || !sig) return INVALID

    // Signature is over the base64url body STRING, not the decoded JSON.
    const valid = await crypto.subtle.verify(
      'Ed25519',
      publicKey,
      base64UrlToBytes(sig).buffer as ArrayBuffer,
      new TextEncoder().encode(body),
    )
    if (!valid) return INVALID

    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(body)))
    if (payload === null || typeof payload !== 'object') return INVALID
    if (typeof payload.email !== 'string' || payload.email.trim() === '') return INVALID
    if (typeof payload.issuedAt !== 'number' || !Number.isFinite(payload.issuedAt)) return INVALID
    // App refresh tokens carry `exp`; license keys never do. Reject them, and
    // reject any non-lifetime plan (e.g. 'trial'), or a 14-day token would
    // redeem as a lifetime license.
    if ('exp' in payload) return INVALID
    if (payload.plan !== 'lifetime') return INVALID

    return { ok: true, claim: { email: normalizeEmail(payload.email), issuedAt: payload.issuedAt } }
  } catch {
    return INVALID
  }
}
