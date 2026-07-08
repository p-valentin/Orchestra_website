import { type NextRequest } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'
import { sanitizeText, isValidEmail } from '@/lib/sanitize'
import { createAccount, MIN_PASSWORD_LENGTH } from '@/lib/accounts'
import { getEntitlement } from '@/lib/entitlement'
import { grantResponse, readJsonBody, requestIp } from '@/lib/licenseApi'
import { sendEmail } from '@/lib/email'

// Creates an account for the desktop app's sign-in. The 14-day trial starts at
// account creation (see lib/entitlement.ts), so the response already carries a
// usable token — no second login round-trip. Emails that already hold a paid
// license or a legacy free claim get a lifetime token straight away.

const RL = { max: 10, windowMs: 15 * 60 * 1000 }

export async function POST(request: NextRequest) {
  const body = await readJsonBody(request)
  if (!body) return Response.json({ ok: false, error: 'bad-json' }, { status: 400 })

  if (!rateLimit('license-register:' + requestIp(request), RL).allowed) {
    return Response.json({ ok: false, error: 'rate-limited' }, { status: 429 })
  }

  const email = sanitizeText(body.email, 254).toLowerCase()
  if (!isValidEmail(email)) {
    return Response.json({ ok: false, error: 'invalid-email' }, { status: 400 })
  }
  const password = typeof body.password === 'string' ? body.password : ''
  if (password.length < MIN_PASSWORD_LENGTH || password.length > 256) {
    return Response.json({ ok: false, error: 'weak-password' }, { status: 400 })
  }

  const created = await createAccount(email, password)
  if (!created.ok) {
    const status = created.reason === 'exists' ? 409 : 502
    return Response.json({ ok: false, error: created.reason === 'exists' ? 'account-exists' : 'store-failed' }, { status })
  }

  const ent = await getEntitlement(email, created.record)
  const res = grantResponse(email, ent)
  if (!res) return Response.json({ ok: false, error: 'not-configured' }, { status: 502 })

  // Owner heads-up, best-effort — never gates the registration.
  await sendEmail('New Orchestra account', `${email} created an account (${res.plan}).`, email).catch(() => false)

  return Response.json(res)
}
