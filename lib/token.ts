import crypto from 'crypto'

// Ed25519-signed license token. The website is the only place that holds the
// PRIVATE key (env LICENSE_PRIVATE_KEY); the desktop app embeds the matching
// public key and verifies offline. Uses Node's built-in crypto — no deps.

export interface LicensePayload {
  email: string
  plan: string
  issuedAt: number
}

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
