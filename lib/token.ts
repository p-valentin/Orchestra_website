import crypto from 'crypto'

// Ed25519-signed license token. The website is the only place that holds the
// PRIVATE key (env LICENSE_PRIVATE_KEY); the desktop app embeds the matching
// public key and verifies offline. Uses Node's built-in crypto — no deps.

export interface LicensePayload {
  email: string
  plan: string
  issuedAt: number
  // Epoch ms the token stops being valid offline. Absent on legacy claim
  // tokens (pre-server-verification builds treat those as lifetime-offline).
  exp?: number
}

// How long the app may run without re-verifying against the server.
export const TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000

// Accepts a raw PEM (multiline, e.g. a Vercel env var) or a single-line base64
// of the PEM (convenient for .env.local). Returns the private KeyObject or null
// when unconfigured/invalid so callers can degrade gracefully.
function privateKey(): crypto.KeyObject | null {
  const raw = process.env.LICENSE_PRIVATE_KEY
  if (!raw) return null
  const pem = raw.includes('BEGIN') ? raw : Buffer.from(raw, 'base64').toString('utf-8')
  try {
    return crypto.createPrivateKey(pem)
  } catch {
    return null
  }
}

// True when a signing key is present and parseable. Claim flows must check
// this BEFORE any side effects: a misconfigured deploy has to fail closed,
// not record claims it can never fulfil (production did exactly that while
// LICENSE_PRIVATE_KEY was missing from Vercel).
export function licenseConfigured(): boolean {
  return privateKey() !== null
}

// Compact token: base64url(payloadJson).base64url(ed25519 sig over that body).
// Ed25519 is deterministic (RFC 8032), so re-signing an identical payload yields
// the same token — a reinstall recovers the exact key from the stored claim.
export function signLicense(payload: LicensePayload): string | null {
  const key = privateKey()
  if (!key) return null
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.sign(null, Buffer.from(body), key).toString('base64url')
  return `${body}.${sig}`
}

// Mints the short-lived token the app holds: valid TOKEN_TTL_MS from now, or
// until the trial ends if that comes first. Returns null when unconfigured.
export function mintAppToken(email: string, plan: string, trialEndsAt?: number): string | null {
  const now = Date.now()
  const exp = trialEndsAt ? Math.min(now + TOKEN_TTL_MS, trialEndsAt) : now + TOKEN_TTL_MS
  return signLicense({ email, plan, issuedAt: now, exp })
}

// Verification lives in the desktop app; this mirror exists for tests and any
// server-side check. Returns the payload only when the signature is valid.
export function verifyLicense(token: string, publicKeyPem: string): LicensePayload | null {
  try {
    const [body, sig] = token.split('.')
    if (!body || !sig) return null
    const key = crypto.createPublicKey(publicKeyPem)
    if (!crypto.verify(null, Buffer.from(body), key, Buffer.from(sig, 'base64url'))) return null
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) as LicensePayload
  } catch {
    return null
  }
}

// Server-side verification for /api/license/refresh: the public key is derived
// from the configured private key, so no extra env var can drift out of sync.
export function verifyLicenseServer(token: string): LicensePayload | null {
  const priv = privateKey()
  if (!priv) return null
  try {
    const [body, sig] = token.split('.')
    if (!body || !sig) return null
    const pub = crypto.createPublicKey(priv)
    if (!crypto.verify(null, Buffer.from(body), pub, Buffer.from(sig, 'base64url'))) return null
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) as LicensePayload
  } catch {
    return null
  }
}
