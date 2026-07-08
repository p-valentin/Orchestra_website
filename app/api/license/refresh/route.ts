import { type NextRequest } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'
import { verifyLicenseServer } from '@/lib/token'
import { getEntitlement } from '@/lib/entitlement'
import { grantResponse, readJsonBody, requestIp } from '@/lib/licenseApi'

// Rolls a valid token's expiry forward. The app calls this in the background
// (startup + every few hours); possession of a validly-signed token is the
// credential — no password, so a machine can re-verify unattended. The
// entitlement is re-checked every time: a revoked license or lapsed trial
// stops refreshing immediately even though the old token verifies.

const RL = { max: 60, windowMs: 60 * 60 * 1000 }

export async function POST(request: NextRequest) {
  const body = await readJsonBody(request)
  if (!body) return Response.json({ ok: false, error: 'bad-json' }, { status: 400 })

  if (!rateLimit('license-refresh:' + requestIp(request), RL).allowed) {
    return Response.json({ ok: false, error: 'rate-limited' }, { status: 429 })
  }

  const token = typeof body.token === 'string' ? body.token : ''
  if (!token || token.length > 8192) {
    return Response.json({ ok: false, error: 'invalid-token' }, { status: 400 })
  }
  const payload = verifyLicenseServer(token)
  if (!payload || !payload.email) {
    return Response.json({ ok: false, error: 'invalid-token' }, { status: 401 })
  }

  const ent = await getEntitlement(payload.email)
  if (ent.plan === 'none') {
    // Definitive "no": the app clears its stored token and hard-blocks.
    return Response.json({ ok: false, error: 'expired' }, { status: 403 })
  }
  const res = grantResponse(payload.email, ent)
  if (!res) return Response.json({ ok: false, error: 'not-configured' }, { status: 502 })
  return Response.json(res)
}
