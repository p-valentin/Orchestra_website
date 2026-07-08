import { type NextRequest } from 'next/server'
import { mintAppToken } from './token'
import { type Entitlement } from './entitlement'

// Shared plumbing for the /api/license/* routes the desktop app calls. The
// caller is the Electron main process (Node fetch), not a browser — no CORS.

export interface LicenseGrantResponse {
  ok: true
  token: string
  plan: 'lifetime' | 'trial'
  trialEndsAt?: number
}

export function requestIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return req.headers.get('x-real-ip') ?? 'unknown'
}

export async function readJsonBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body = (await req.json()) as unknown
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null
    return body as Record<string, unknown>
  } catch {
    return null
  }
}

// Turns a positive entitlement into the token response. Returns null when the
// entitlement doesn't grant access (caller maps that to its own error) or when
// signing is unconfigured.
export function grantResponse(email: string, ent: Entitlement): LicenseGrantResponse | null {
  if (ent.plan === 'none') return null
  const token = ent.plan === 'lifetime' ? mintAppToken(email, 'lifetime') : mintAppToken(email, 'trial', ent.endsAt)
  if (!token) return null
  return ent.plan === 'lifetime'
    ? { ok: true, token, plan: 'lifetime' }
    : { ok: true, token, plan: 'trial', trialEndsAt: ent.endsAt }
}
