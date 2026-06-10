function constantTimeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length)
  let diff = a.length === b.length ? 0 : 1
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return diff === 0
}

export function isAdminRequest(authorization: string | null): boolean {
  const password = process.env.ADMIN_PASSWORD
  if (!password) return false
  if (!authorization?.startsWith('Basic ')) return false
  let decoded: string
  try {
    decoded = atob(authorization.slice(6))
  } catch {
    return false
  }
  const given = decoded.slice(decoded.indexOf(':') + 1)
  return constantTimeEqual(given, password)
}
