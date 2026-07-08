// Session tokens are `<expiry-ms>.<hmac>` signed with a key derived from the
// admin password, so rotating the password invalidates every session. Uses
// Web Crypto only — this file must stay importable from edge middleware.

// __Secure- prefix makes the browser refuse the cookie unless it's set with
// Secure over HTTPS — production only, since local dev runs plain HTTP.
export const SESSION_COOKIE =
  process.env.NODE_ENV === 'production' ? '__Secure-orchestra_admin' : 'orchestra_admin'
export const SESSION_HOURS = 24 * 7

function constantTimeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length)
  let diff = a.length === b.length ? 0 : 1
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return diff === 0
}

export function verifyPassword(given: string): boolean {
  const password = process.env.ADMIN_PASSWORD
  if (!password) return false
  return constantTimeEqual(given, password)
}

async function signingKey(): Promise<CryptoKey | null> {
  const password = process.env.ADMIN_PASSWORD
  if (!password) return null
  const material = new TextEncoder().encode(`orchestra-admin-session:${password}`)
  const digest = await crypto.subtle.digest('SHA-256', material)
  return crypto.subtle.importKey('raw', digest, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function createSessionToken(): Promise<string | null> {
  const key = await signingKey()
  if (!key) return null
  const expires = String(Date.now() + SESSION_HOURS * 3_600_000)
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(expires))
  return `${expires}.${hex(mac)}`
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false
  const dot = token.indexOf('.')
  if (dot === -1) return false
  const expires = token.slice(0, dot)
  const mac = token.slice(dot + 1)
  if (!/^\d+$/.test(expires) || Number(expires) < Date.now()) return false
  const key = await signingKey()
  if (!key) return false
  const expected = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(expires))
  return constantTimeEqual(mac, hex(expected))
}
