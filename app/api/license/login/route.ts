import { type NextRequest } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'
import { sanitizeText, isValidEmail } from '@/lib/sanitize'
import { getAccount, verifyPassword } from '@/lib/accounts'
import { getEntitlement } from '@/lib/entitlement'
import { grantResponse, readJsonBody, requestIp } from '@/lib/licenseApi'

// Desktop app sign-in: authenticates the account, resolves what the email is
// entitled to (paid license / legacy claim / running trial) and mints the
// 14-day token the app stores. A correct password with an expired trial gets a
// distinct error so the app can show "trial over — buy" instead of a shrug.

const RL = { max: 10, windowMs: 15 * 60 * 1000 }

export async function POST(request: NextRequest) {
  const body = await readJsonBody(request)
  if (!body) return Response.json({ ok: false, error: 'bad-json' }, { status: 400 })

  const email = sanitizeText(body.email, 254).toLowerCase()
  if (!isValidEmail(email)) {
    return Response.json({ ok: false, error: 'invalid-email' }, { status: 400 })
  }
  // Limit per-IP and per-account, so credential stuffing can't hide behind
  // either a botnet (per-IP misses) or a single box (per-account misses).
  if (!rateLimit('license-login:' + requestIp(request), RL).allowed || !rateLimit('license-login:' + email, RL).allowed) {
    return Response.json({ ok: false, error: 'rate-limited' }, { status: 429 })
  }

  const password = typeof body.password === 'string' ? body.password : ''
  const account = await getAccount(email)
  if (!account || !(await verifyPassword(account, password))) {
    return Response.json({ ok: false, error: 'invalid-credentials' }, { status: 401 })
  }

  const ent = await getEntitlement(email, account)
  if (ent.plan === 'none') {
    return Response.json({ ok: false, error: 'trial-expired' }, { status: 403 })
  }
  const res = grantResponse(email, ent)
  if (!res) return Response.json({ ok: false, error: 'not-configured' }, { status: 502 })
  return Response.json(res)
}
