// POST /refund-request — self-serve refund inside the 14-day window.
//
// This is the only endpoint in the system that moves money, and it does so on
// an ordinary buyer's say-so, so every guard below is load-bearing:
//
//   1. Identity comes from the JWT (§1). The caller never names a licence —
//      we look up THEIR licence. There is no licence id in the request body to
//      tamper with, so no possibility of refunding someone else's purchase.
//   2. Eligibility is recomputed server-side. The button being visible proves
//      nothing; the window and the status are checked here, on stored data.
//   3. The double-refund guard is a UNIQUE INDEX, not an if-statement. Two
//      concurrent clicks are two concurrent transactions and only the database
//      can serialise them — the loser gets 23505 and becomes a 409, so Polar
//      is called at most once per licence.
//   4. The row is written BEFORE the provider call, so a refund that succeeds
//      at Polar can never be invisible to us. If the call then fails we mark
//      the row failed (freeing the buyer to retry) and alert the owner.
//
// The licence is NOT deactivated here. That happens where it always has: the
// order.refunded webhook. One writer for entitlement, no second source of
// truth, and a refund issued from Polar's dashboard behaves identically.

import { errorResponse, json, preflight, serviceClient } from '../_shared/http.ts'
import { authenticateRequest, readJsonBody } from '../_shared/http.ts'
import { createRefund } from '../_shared/polar.ts'
import { sendOwnerRefundFailure } from '../_shared/resend.ts'

// Kept in step with the check constraint in 0006_refund_requests.sql.
const REASONS = new Set([
  'not_what_expected',
  'missing_feature',
  'too_difficult',
  'bugs',
  'too_expensive',
  'bought_by_mistake',
  'other',
])

const WINDOW_DAYS = 14
const MAX_DETAIL = 2000

export function isWithinWindow(purchasedAt: string, now: number = Date.now()): boolean {
  const purchased = Date.parse(purchasedAt)
  if (!Number.isFinite(purchased)) return false
  const elapsed = now - purchased
  // A future purchased_at (clock skew on the provider side) must not read as
  // "expired 14 days ago" — treat anything not yet elapsed as inside.
  return elapsed < WINDOW_DAYS * 24 * 60 * 60 * 1000
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight()
  if (req.method !== 'POST') return errorResponse(405, 'method_not_allowed')

  const supabase = serviceClient()
  const user = await authenticateRequest(req, supabase)
  if (!user) return errorResponse(401, 'unauthenticated')

  const body = await readJsonBody(req)
  if (!body) return errorResponse(400, 'invalid_request')

  const reason = typeof body.reason === 'string' ? body.reason : ''
  if (!REASONS.has(reason)) return errorResponse(400, 'invalid_reason')
  const detail = typeof body.detail === 'string' ? body.detail.trim().slice(0, MAX_DETAIL) : null

  // The caller's own active licence — never one they named.
  const { data: licenses, error: readErr } = await supabase
    .from('licenses')
    .select('id, order_id, status, purchased_at, buyer_email')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('purchased_at', { ascending: false })
    .limit(1)
  if (readErr) {
    console.error('[refund] licence lookup failed:', readErr.message)
    return errorResponse(500, 'internal_error')
  }
  const license = licenses?.[0]
  if (!license) return errorResponse(404, 'no_refundable_license')

  // A legacy licence has no provider order to refund against — those are
  // handled by a human, not by this endpoint.
  if (!license.order_id) return errorResponse(409, 'not_self_refundable')
  if (!isWithinWindow(license.purchased_at)) return errorResponse(409, 'window_closed')

  const apiKey = Deno.env.get('POLAR_API_KEY')
  if (!apiKey) {
    console.error('[refund] POLAR_API_KEY unset — cannot issue refunds')
    return errorResponse(503, 'refunds_unavailable')
  }

  // The amount comes from the stored order.paid event, never from the request
  // body. No stored event means this licence did not come from Polar — a
  // Paddle-era purchase, or one predating the event store — and cannot be
  // refunded through Polar's API at all.
  //
  // Checked BEFORE the guard row is written, so an un-refundable licence does
  // not leave a `failed` row behind, and the buyer gets an honest "this needs a
  // human" rather than "try again shortly" for something that will never work.
  const { data: order } = await supabase
    .from('webhook_events')
    .select('payload')
    .eq('provider', 'polar')
    .eq('event_name', 'order.paid')
    .eq('payload->data->>id', license.order_id)
    .order('received_at', { ascending: false })
    .limit(1)
  const orderData = order?.[0]?.payload?.data
  const currency = orderData?.currency ?? null

  // Polar's refund API takes the NET amount — before tax — and refunds the
  // proportional tax on top of it automatically. Sending the tax-inclusive
  // total is rejected with "Refund amount exceeds refundable amount", so the
  // buyer gets their money back in full by asking for `refundable_amount`,
  // not by asking for what they paid.
  //
  // This cost us a real failed refund to find: every sandbox order was
  // zero-tax, which made total_amount and refundable_amount identical and hid
  // the difference completely. The first order with VAT on it broke.
  //
  // `refundable_amount` also already accounts for anything previously
  // refunded, so it stays correct if a partial refund was ever issued by hand
  // in Polar's dashboard.
  const refundableCents = Number(orderData?.refundable_amount ?? orderData?.net_amount)
  // What the buyer actually paid, tax included — recorded for humans reading
  // the admin page, never sent to the refund API.
  const paidCents = Number(orderData?.total_amount)

  if (!Number.isFinite(refundableCents) || refundableCents < 1) {
    console.error(`[refund] no stored Polar order for ${license.order_id} — not self-refundable`)
    return errorResponse(409, 'not_self_refundable')
  }

  // Claim the licence for refunding. The partial unique index means exactly one
  // of any number of concurrent callers gets past this line.
  const { data: request, error: insertErr } = await supabase
    .from('refund_requests')
    .insert({
      license_id: license.id,
      user_id: user.id,
      order_id: license.order_id,
      reason,
      detail,
      status: 'submitted',
    })
    .select('id')
    .single()
  if (insertErr) {
    if (insertErr.code === '23505') return errorResponse(409, 'already_requested')
    console.error('[refund] request insert failed:', insertErr.message)
    return errorResponse(500, 'internal_error')
  }

  const result = await createRefund({
    apiKey,
    orderId: license.order_id,
    amountCents: refundableCents,
    comment: `Self-serve refund from /account — ${reason}`,
  })

  if (!result.ok) {
    await supabase.from('refund_requests')
      .update({ status: 'failed', failure_reason: (result.error ?? 'unknown').slice(0, 500) })
      .eq('id', request.id)
    console.error(`[refund] provider refused for order ${license.order_id}:`, result.error)
    await sendOwnerRefundFailure({
      orderId: license.order_id,
      buyerEmail: license.buyer_email,
      reason,
      detail,
      error: result.error ?? 'unknown',
    })
    // Never echo the provider's message to the browser — it can carry account
    // and order internals the buyer has no business seeing.
    return errorResponse(502, result.permanent ? 'refund_not_possible' : 'refund_failed')
  }

  await supabase.from('refund_requests')
    .update({
      status: 'refunded',
      provider_refund_id: result.refundId ?? null,
      // Record what the buyer PAID, not the net we asked Polar for — the admin
      // page is read by a person reconciling against a receipt.
      amount_cents: Number.isFinite(paidCents) ? paidCents : refundableCents,
      currency,
      completed_at: new Date().toISOString(),
    })
    .eq('id', request.id)

  // Deliberately no email from here. The order.refunded webhook is seconds
  // away and already emails both the buyer and the owner — and it enriches the
  // owner's alert with the reason captured above, so one message carries the
  // whole story instead of two arriving out of order.
  return json(200, { ok: true, status: 'refunded' })
})
