// POST /admin-data — purchases and refund requests for the admin page.
//
// This is the most sensitive read in the system: buyer emails, amounts, order
// references and the free-text reasons customers gave for wanting their money
// back. It is therefore built to be boring and narrow.
//
//   - No query language. The caller picks from a fixed set of views and gets a
//     fixed set of columns. There is nothing to inject and nothing to widen.
//   - Signed, expiring requests (see _shared/admin-auth.ts). No static bearer
//     token exists to leak.
//   - Emails are MASKED unless the caller explicitly asks for them, and asking
//     is recorded in the response so the site can audit it. The admin page
//     renders masked by default, so a screenshot or a shoulder-surfer gets
//     nothing useful.
//   - Hard row caps. A compromised caller cannot vacuum the whole table in one
//     request, and the response stays small enough to render.
//   - Every failure is 404. A prober learns nothing, not even that the
//     function exists.
//
// verify_jwt = false in config.toml because the caller is the website's server,
// which holds no Supabase user session. The signature IS the authentication.

import { serviceClient } from '../_shared/http.ts'
import { verifyAdminRequest } from '../_shared/admin-auth.ts'

const MAX_LIMIT = 200

// A 404 for everything: wrong signature, wrong method, bad body, unknown view.
function notFound(): Response {
  return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
}

// val***98@gmail.com — enough to recognise a buyer you already know, useless
// to anyone who doesn't.
function maskEmail(email: string | null): string | null {
  if (!email) return null
  const at = email.indexOf('@')
  if (at < 1) return '***'
  const local = email.slice(0, at)
  const domain = email.slice(at)
  if (local.length <= 3) return `${local[0]}***${domain}`
  return `${local.slice(0, 3)}***${local.slice(-1)}${domain}`
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return notFound()

  // Read the body once, as text: the signature covers its exact bytes.
  const rawBody = await req.text()
  const secret = Deno.env.get('ADMIN_DATA_SECRET') ?? ''
  if (!(await verifyAdminRequest(req, rawBody, secret))) return notFound()

  let request: { view?: unknown; limit?: unknown; reveal?: unknown }
  try {
    request = JSON.parse(rawBody || '{}')
  } catch {
    return notFound()
  }

  const limit = Math.min(
    Math.max(typeof request.limit === 'number' && Number.isFinite(request.limit) ? request.limit : 50, 1),
    MAX_LIMIT,
  )
  const reveal = request.reveal === true
  const supabase = serviceClient()

  if (request.view === 'purchases') {
    const { data, error } = await supabase
      .from('licenses')
      .select('id, order_id, buyer_email, user_id, status, plan, purchased_at, claimed_at')
      .order('purchased_at', { ascending: false })
      .limit(limit)
    if (error) {
      console.error('[admin-data] purchases read failed:', error.message)
      return notFound()
    }
    return Response.json({
      view: 'purchases',
      revealed: reveal,
      rows: (data ?? []).map((r) => ({
        ...r,
        buyer_email: reveal ? r.buyer_email : maskEmail(r.buyer_email),
        // Never ship the raw account uuid to a rendering layer that doesn't
        // need it; "is it attached" is the only question the page asks.
        user_id: undefined,
        attached: r.user_id !== null,
      })),
    })
  }

  if (request.view === 'refunds') {
    const { data, error } = await supabase
      .from('refund_requests')
      .select('id, order_id, reason, detail, status, failure_reason, amount_cents, currency, created_at, completed_at')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) {
      console.error('[admin-data] refunds read failed:', error.message)
      return notFound()
    }
    // Buyer emails are not selected at all here: a refund row is identified by
    // its order reference, and the purchases view already carries the address.
    return Response.json({ view: 'refunds', revealed: reveal, rows: data ?? [] })
  }

  // The only write this endpoint accepts. The website has no service-role key
  // — deliberately — so the compose box cannot insert its own audit row and has
  // to ask for it here, under the same HMAC as every read.
  //
  // Narrow on purpose: it appends one row to a log and can express nothing
  // else. Status is constrained to the two the table allows, and the strings
  // are truncated, so a bug in the caller cannot turn this into unbounded
  // storage. Nothing here can modify a licence, a refund or an account.
  if (request.view === 'record-email') {
    const rec = request.record
    if (!rec || typeof rec !== 'object') return notFound()
    const status = rec.status === 'failed' ? 'failed' : 'sent'
    const str = (v: unknown, max: number): string | null =>
      typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
    const toEmail = str(rec.to_email, 254)
    const subject = str(rec.subject, 200)
    if (!toEmail || !subject) return notFound()

    const { error } = await supabase.from('sent_emails').insert({
      to_email: toEmail,
      subject,
      status,
      provider_id: str(rec.provider_id, 128),
      error: str(rec.error, 500),
      source: str(rec.source, 40) ?? 'admin-form',
    })
    if (error) {
      console.error('[admin-data] email record failed:', error.message)
      return notFound()
    }
    return Response.json({ view: 'record-email', ok: true })
  }

  if (request.view === 'emails') {
    const { data, error } = await supabase
      .from('sent_emails')
      .select('id, to_email, subject, status, provider_id, error, source, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) {
      console.error('[admin-data] emails read failed:', error.message)
      return notFound()
    }
    // Masked by default like purchases. A log of who we have written to is a
    // list of customer addresses; the page should stay safe to screenshot
    // without thinking about it, and revealing stays a deliberate act.
    return Response.json({
      view: 'emails',
      revealed: reveal,
      rows: (data ?? []).map((r) => ({
        ...r,
        to_email: reveal ? r.to_email : maskEmail(r.to_email),
      })),
    })
  }

  return notFound()
})
