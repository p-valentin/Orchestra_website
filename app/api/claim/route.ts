import { type NextRequest } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'
import { sanitizeText, isValidEmail } from '@/lib/sanitize'
import { recordClaim } from '@/lib/claim'

// JSON endpoint for the desktop app's "claim free license" flow. The caller is
// the Electron main process (Node), not a browser, so no CORS handling is
// needed. Mirrors /api/feedback. Each accepted claim decrements the shared
// license counter — but only once the notification email is sent (see
// lib/claim.ts), which also keeps the public endpoint from being scripted to
// drain the pool without a real email going out.

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

  // The app stores this token directly; the delivery email is a backup, so we
  // don't fail the call when email is down.
  return Response.json({ ok: true, token: result.token })
}
