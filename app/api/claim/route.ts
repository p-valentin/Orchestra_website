import { type NextRequest } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'
import { sanitizeText, isValidEmail } from '@/lib/sanitize'
import { recordClaim } from '@/lib/claim'

// JSON endpoint for the desktop app's "claim free license" flow. The caller is
// the Electron main process (Node), not a browser, so no CORS handling is
// needed. Mirrors /api/feedback. Each accepted claim writes a per-email record
// (the public count is derived from those) and notifies the owner, who sends
// keys personally — except here, where the token is returned for instant
// in-app activation.

function requestIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return req.headers.get('x-real-ip') ?? 'unknown'
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ ok: false, error: 'bad-json' }, { status: 400 })
  }

  if (!rateLimit('claim:' + requestIp(request)).allowed) {
    return Response.json({ ok: false, error: 'rate-limited' }, { status: 429 })
  }

  const email = sanitizeText(body.email, 254)
  if (!isValidEmail(email)) {
    return Response.json({ ok: false, error: 'invalid-email' }, { status: 400 })
  }

  const source = sanitizeText(body.source, 40) || 'app'
  const result = await recordClaim(email, source)
  if (!result.ok) {
    const status = result.reason === 'closed' ? 409 : 502
    return Response.json({ ok: false, error: result.reason }, { status })
  }

  // The app stores this token directly, so app claims activate without
  // waiting on the owner.
  return Response.json({ ok: true, token: result.token })
}
