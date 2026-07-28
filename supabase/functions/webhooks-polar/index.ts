// POST /webhooks-polar — the ONLY writer of Polar-originated license rows
// (§2.1). Public endpoint (verify_jwt = false in config.toml); authentication
// is the Standard Webhooks HMAC, verified on the raw body before anything else.
//
// Idempotency (§2.2): every event is stored in webhook_events first, keyed by
// Polar's `webhook-id` HEADER — unlike Paddle, the Polar payload carries no
// event id, and the Standard Webhooks spec guarantees the header is stable
// across retries of the same event. See _shared/webhook-events.ts for the
// dedupe and release semantics.
//
// Account binding: the license attaches by data.metadata.user_id, which the
// site sets server-side from the signed-in account's JWT when it opens
// checkout. There is deliberately NO email fallback here — an email typed at
// checkout is buyer-editable and must never decide whose account gets the
// license. An order that arrives without a resolvable account is recorded
// UNCLAIMED and logged; the buyer still recovers it by signing up with the
// purchase email, which the (separately reviewed) entitlement auto-claim
// handles against their own confirmed address.
//
// Buyer email: order.paid carries data.customer.email directly, so there is no
// equivalent of the Paddle customer-lookup dance.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { errorResponse, json, serviceClient } from '../_shared/http.ts'
import { parsePolarEvent, polarSignatureHeaders, verifyPolarSignature, type PolarEvent } from '../_shared/polar.ts'
import { sendClaimEmail, sendOwnerRefundNotice, sendRefundEmail } from '../_shared/resend.ts'
import { markProcessed, pruneOldEvents, releaseEvent, storeEvent } from '../_shared/webhook-events.ts'

const PROVIDER = 'polar'

class Unattributable extends Error {
  constructor(orderId: string) {
    super(`order ${orderId} has neither a customer email nor metadata.user_id — releasing event for retry`)
  }
}

// order.paid: the purchase. Conflict-ignoring insert — it must never overwrite
// an existing row, so a refund that arrived first stays refunded.
async function handleOrderPaid(supabase: SupabaseClient, event: PolarEvent): Promise<void> {
  if (!event.orderId) return
  // We sell one thing: a one-time lifetime license. An order attached to a
  // subscription isn't ours to license — store it and move on rather than
  // minting a lifetime license on a renewal.
  if (event.subscriptionId) {
    console.warn(`[polar] order ${event.orderId} belongs to subscription ${event.subscriptionId} — no license created`)
    return
  }

  const buyerEmail = event.customerEmail
  // Never create a license row nobody can be matched to. Polar's schema always
  // sends customer.email, so this is a malformed payload; 500-and-release lets
  // a retry (or a dashboard replay) succeed instead of stranding the purchase
  // in an orphaned row.
  if (!buyerEmail && !event.metadataUserId) throw new Unattributable(event.orderId)

  const { error: insertErr } = await supabase
    .from('licenses')
    .upsert(
      { order_id: event.orderId, buyer_email: buyerEmail ?? '', status: 'active', plan: 'lifetime' },
      { onConflict: 'order_id', ignoreDuplicates: true },
    )
  if (insertErr) throw insertErr

  const { data: license, error: readErr } = await supabase
    .from('licenses')
    .select('id, status, user_id')
    .eq('order_id', event.orderId)
    .single()
  if (readErr) throw readErr
  if (license.status !== 'active') return // pre-existing refunded row: no attach, no email

  let attachedUserId: string | null = license.user_id
  if (attachedUserId === null && event.metadataUserId) {
    // The atomic `user_id IS NULL` guard makes concurrent deliveries resolve to
    // exactly one winner. A bogus id can't attach: a malformed uuid is a 22P02
    // and a well-formed one that isn't an account trips the FK to auth.users —
    // both leave the row unclaimed rather than mis-attached.
    const now = new Date().toISOString()
    const { data: attached, error: attachErr } = await supabase
      .from('licenses')
      .update({ user_id: event.metadataUserId, claimed_at: now })
      .eq('id', license.id)
      .is('user_id', null)
      .select('user_id')
    if (attachErr) {
      console.error(`[polar] metadata.user_id did not resolve to an account for order ${event.orderId}:`, attachErr.message)
    } else if (attached && attached.length > 0) {
      attachedUserId = attached[0].user_id
    } else {
      // Lost the race — re-read whoever won so the confirmation email still
      // goes to the right account.
      const { data: current } = await supabase.from('licenses').select('user_id').eq('id', license.id).single()
      attachedUserId = current?.user_id ?? null
    }
  }

  if (attachedUserId === null) {
    // The alert: this purchase is paid for but sits on no account. It is
    // recoverable (sign up with the purchase email → entitlement auto-claims),
    // but it should never happen through our own checkout, so make it loud.
    console.error(
      `[polar] order ${event.orderId} left UNCLAIMED — metadata.user_id ` +
        `${event.metadataUserId === null ? 'absent' : 'unresolvable'}; buyer must claim via sign-up`,
    )
  }

  // The confirmation email goes to the ACCOUNT's own address whenever the
  // purchase is bound to an account — only Polar's receipt goes to the
  // (editable) paying email. Unclaimed orders fall back to the buyer email,
  // which is the address that can still claim it. Best-effort (§2.4);
  // sendClaimEmail never throws.
  let confirmationEmail = buyerEmail
  if (attachedUserId) {
    const { data: acct, error: acctErr } = await supabase.auth.admin.getUserById(attachedUserId)
    if (!acctErr && acct?.user?.email) confirmationEmail = acct.user.email
  }
  if (confirmationEmail) {
    // `claimed` picks the copy: an attached licence needs no instructions, so
    // telling that buyer to "create your account" would be both wrong and
    // phishing-shaped. Only a genuinely unclaimed order gets the sign-up steps.
    await sendClaimEmail(confirmationEmail, event.invoiceNumber ?? event.orderId, {
      claimed: attachedUserId !== null,
      amountCents: event.amountCents,
      currency: event.currency,
    })
  }
}

// Any refund revokes, matching the Paddle path: Polar distinguishes a full
// `refunded` from a `partially_refunded` order, but a partial refund on a
// single-item lifetime purchase is still a refund of that purchase.
// Chargebacks need no separate branch — Polar surfaces a dispute as a Refund
// carrying a `dispute` object, so it arrives down these same paths. There is
// no dispute-resolution webhook, so reinstating a license after a won dispute
// is a manual admin action.
//
// Out-of-order delivery creates the row as refunded so a late order.paid can't
// resurrect it.
// Returns the row it actually transitioned, or null when there was nothing to
// transition (no such order, or already refunded). Callers use that to send the
// refund email EXACTLY once: `order.refunded` and `refund.created` both fire for
// the same refund, and the `.neq('status','refunded')` guard means only one of
// them gets the row back — the other sees zero rows and stays quiet.
interface RevokedLicense {
  id: string
  user_id: string | null
  buyer_email: string
}

async function revokeLicense(
  supabase: SupabaseClient,
  orderId: string,
  buyerEmail: string | null,
): Promise<RevokedLicense | null> {
  const { data: updated, error: updateErr } = await supabase
    .from('licenses')
    .update({ status: 'refunded' })
    .eq('order_id', orderId)
    .neq('status', 'refunded')
    .select('id, user_id, buyer_email')
  if (updateErr) throw updateErr
  if (updated && updated.length > 0) return updated[0] as RevokedLicense

  // Zero rows: either the licence is already refunded (a second delivery for
  // the same refund) or no row exists yet. Distinguish, because only the
  // second case should create one.
  const { data: existing, error: readErr } = await supabase
    .from('licenses')
    .select('id')
    .eq('order_id', orderId)
    .maybeSingle()
  if (readErr) throw readErr
  if (existing) return null // already refunded — no second email

  const { error: insertErr } = await supabase.from('licenses').insert({
    order_id: orderId,
    buyer_email: buyerEmail ?? '', // not-null column; refund-first rows may carry no email
    status: 'refunded',
    plan: 'lifetime',
  })
  if (insertErr) {
    // Race with a concurrent order.paid — flip the winner.
    if (insertErr.code === '23505') {
      const { error } = await supabase.from('licenses').update({ status: 'refunded' }).eq('order_id', orderId)
      if (error) throw error
      return null
    }
    throw insertErr
  }
  // Refund-before-purchase: the row exists now, but nobody has bought anything
  // from our point of view yet, so there is no one to notify.
  return null
}

// Tells the buyer their licence is gone, at the account address when the
// licence is attached (the same rule the purchase email follows). Best-effort:
// a refund is already recorded in the database, and a failed email must never
// fail the webhook.
async function notifyRefund(
  supabase: SupabaseClient,
  revoked: RevokedLicense,
  event: PolarEvent,
): Promise<void> {
  let accountEmail: string | null = null
  if (revoked.user_id) {
    const { data: acct, error } = await supabase.auth.admin.getUserById(revoked.user_id)
    if (!error && acct?.user?.email) accountEmail = acct.user.email
  }

  const to = accountEmail ?? revoked.buyer_email
  if (to) {
    await sendRefundEmail(to, event.invoiceNumber ?? event.orderId, {
      amountCents: event.amountCents,
      currency: event.currency,
    })
  }

  // The owner gets told regardless of whether the buyer could be — an
  // unattributable refund is exactly the case worth a human looking at.
  await sendOwnerRefundNotice({
    orderId: event.orderId ?? '(unknown)',
    reference: event.invoiceNumber,
    buyerEmail: revoked.buyer_email,
    accountEmail,
    amountCents: event.amountCents,
    currency: event.currency,
  })
}

// order.refunded: data is the Order, so the buyer email is available for a
// refund-before-purchase row.
async function handleOrderRefunded(supabase: SupabaseClient, event: PolarEvent): Promise<void> {
  if (!event.orderId) return
  const revoked = await revokeLicense(supabase, event.orderId, event.customerEmail)
  if (revoked) await notifyRefund(supabase, revoked, event)
}

// refund.created / refund.updated: data is the Refund, which points at
// data.order_id and carries no email. Only a settled refund acts — pending,
// failed and canceled are stored and ignored.
async function handleRefund(supabase: SupabaseClient, event: PolarEvent): Promise<void> {
  if (!event.orderId || event.refundStatus !== 'succeeded') return
  const revoked = await revokeLicense(supabase, event.orderId, null)
  if (revoked) await notifyRefund(supabase, revoked, event)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return errorResponse(405, 'method_not_allowed')

  // Signature first, over the raw body, before any parsing.
  const rawBody = await req.text()
  const headers = polarSignatureHeaders(req.headers)
  const secret = Deno.env.get('POLAR_WEBHOOK_SECRET') ?? ''
  if (!(await verifyPolarSignature(rawBody, headers, secret))) {
    return errorResponse(401, 'invalid_signature')
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return errorResponse(400, 'invalid_payload')
  }

  const event = parsePolarEvent(payload)
  // Guaranteed non-null: verification above rejects a missing webhook-id.
  const eventId = headers.id!
  const supabase = serviceClient()

  const outcome = await storeEvent(supabase, PROVIDER, eventId, event.eventType, payload)
  if (outcome === 'error') return errorResponse(500, 'internal_error')
  if (outcome === 'done') return json(200, { ok: true })

  try {
    if (event.eventType === 'order.paid') await handleOrderPaid(supabase, event)
    else if (event.eventType === 'order.refunded') await handleOrderRefunded(supabase, event)
    else if (event.eventType.startsWith('refund.')) await handleRefund(supabase, event)
    // Everything else — checkout.*, customer.*, subscription.*, order.created,
    // order.updated, benefit*, product.*, organization.* — is stored above,
    // 200, no-op.

    await markProcessed(supabase, PROVIDER, eventId)
    await pruneOldEvents(supabase)
    return json(200, { ok: true })
  } catch (err) {
    // Release the idempotency slot so the Polar retry can reprocess.
    console.error('webhook processing failed:', err instanceof Error ? err.message : err)
    await releaseEvent(supabase, PROVIDER, eventId)
    return errorResponse(500, 'internal_error')
  }
})
