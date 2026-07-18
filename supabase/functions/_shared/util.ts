// Small shared primitives. No Supabase or jose imports here so the unit tests
// stay dependency-light.

// Emails are normalized (lowercase, trimmed) at every write and comparison —
// design principle §2.3.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=')
  const raw = atob(padded)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

// Secrets may be stored as a raw multi-line PEM or as single-line base64 of
// the PEM (matches how the website handles LICENSE_PRIVATE_KEY).
export function pemFromEnvValue(raw: string): string {
  return raw.includes('BEGIN') ? raw : new TextDecoder().decode(base64UrlToBytes(raw.replace(/\s/g, '')))
}

export function pemToDer(pem: string): Uint8Array {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')
  const raw = atob(b64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}
