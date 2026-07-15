// POST /webhooks-paddle — the ONLY writer of Paddle-originated license rows
// (§2.1). Public endpoint (verify_jwt = false in config.toml); authentication
// is the Paddle-Signature HMAC, verified on the raw body before anything else.
//
// Idempotency (§2.2): every event is inserted into webhook_events first,
// keyed by Paddle's globally unique event_id; a unique-constraint hit means
// already processed → 200 and stop. If processing fails AFTER that insert,
// the event row is deleted before the 500 — otherwise the Paddle retry would
// hit the dedupe and the event would be lost forever.
//
// Buyer email: Paddle transaction events carry customer_id, not the email.
// Resolution order: (1) a stored customer.created/updated event for that
// customer (Paddle delivers those alongside first purchases), (2) the Paddle
// API when PADDLE_API_KEY is set, (3) fail-and-release so the retry succeeds
// once the customer event lands — a license row is never created without a
// normalized buyer email, because email auto-claim is the whole point.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { errorResponse, json, serviceClient } from '../_shared/http.ts'
import {
  fetchCustomerEmail,
  parsePaddleEvent,
  verifyPaddleSignature,
  type PaddleEvent,
} from '../_shared/paddle.ts'
import { sendClaimEmail } from '../_shared/resend.ts'
import { normalizeEmail, sha256Hex } from '../_shared/util.ts'

const PROVIDER = 'paddle'

class EmailUnresolvable extends Error {
  constructor(customerId: string | null) {
    super(`buyer email unresolvable for customer ${customerId ?? '(none)'} — releasing event for retry`)
  }
}

async function resolveBuyerEmail(supabase: SupabaseClient, customerId: string | null): Promise<string | null> {
  if (!customerId) return null

  // Stored customer.* events are the primary source — no API round-trip.
  const { data: events, error } = await supabase
    .from('webhook_events')
    .select('payload')
    .eq('provider', PROVIDER)
    .like('event_name', 'customer.%')
    .eq('payload->data->>id', customerId)
    .order('received_at', { ascending: false })
    .limit(1)
  if (error) throw error
  const stored = events?.[0]?.payload?.data?.email
  if (typeof stored === 'string' && stored !== '') return normalizeEmail(stored)

  const apiKey = Deno.env.get('PADDLE_API_KEY')
  if (apiKey) {
    const base = Deno.env.get('PADDLE_API_BASE_URL') ?? 'https://api.paddle.com'
    return await fetchCustomerEmail(base, apiKey, customerId)
  }
  return null
}

// transaction.completed: the purchase. Conflict-ignoring insert — it must
// never overwrite an existing row (a refund that arrived first stays
// refunded, test 35p).
async function handleTransactionCompleted(supabase: SupabaseClient, event: PaddleEvent): Promise<void> {
  if (event.transactionStatus !== 'completed' || !event.entityId) return

  const buyerEmail = await resolveBuyerEmail(supabase, event.customerId)
  if (!buyerEmail) throw new EmailUnresolvable(event.customerId)

  const { error: insertErr } = await supabase
    .from('licenses')
    .upsert(
      { order_id: event.entityId, buyer_email: buyerEmail, status: 'active', plan: 'lifetime' },
      { onConflict: 'order_id', ignoreDuplicates: true },
    )
  if (insertErr) throw insertErr

  const { data: license, error: readErr } = await supabase
    .from('licenses')
    .select('id, status, user_id')
    .eq('order_id', event.entityId)
    .single()
  if (readErr) throw readErr
  if (license.status !== 'active') return // pre-existing refunded row: no attach, no email

  if (license.user_id === null) {
    const { data: userId, error: lookupErr } = await supabase.rpc('user_id_by_email', { p_email: buyerEmail })
    if (lookupErr) throw lookupErr
    if (userId) {
      const { error: attachErr } = await supabase
        .from('licenses')
        .update({ user_id: userId, claimed_at: new Date().toISOString() })
        .eq('id', license.id)
        .is('user_id', null)
      if (attachErr) throw attachErr
    }
  }

  // Best-effort only (§2.4); sendClaimEmail never throws. Paddle has no
  // human-friendly order number — support references the txn id instead.
  await sendClaimEmail(buyerEmail, null)
}

// adjustment.* with action=refund: only "approved" acts. Out-of-order
// delivery creates the row as refunded so a late purchase can't resurrect it.
async function handleRefund(supabase: SupabaseClient, event: PaddleEvent): Promise<void> {
  if (event.adjustmentAction !== 'refund' || event.adjustmentStatus !== 'approved' || !event.entityId) return

  const { data: updated, error: updateErr } = await supabase
    .from('licenses')
    .update({ status: 'refunded' })
    .eq('order_id', event.entityId)
    .select('id')
  if (updateErr) throw updateErr
  if (updated && updated.length > 0) return

  const buyerEmail = await resolveBuyerEmail(supabase, event.customerId)
  const { error: insertErr } = await supabase.from('licenses').insert({
    order_id: event.entityId,
    buyer_email: buyerEmail ?? '', // not-null column; refund-first rows may predate any customer event
    status: 'refunded',
    plan: 'lifetime',
  })
  if (insertErr) {
    // Race with a concurrent transaction.completed — flip the winner.
    if (insertErr.code === '23505') {
      const { error } = await supabase.from('licenses').update({ status: 'refunded' }).eq('order_id', event.entityId)
      if (error) throw error
      return
    }
    throw insertErr
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return errorResponse(405, 'method_not_allowed')

  // Signature first, over the raw body, before any parsing.
  const rawBody = await req.text()
  const signature = req.headers.get('Paddle-Signature') ?? ''
  const secret = Deno.env.get('PADDLE_WEBHOOK_SECRET') ?? ''
  if (!(await verifyPaddleSignature(rawBody, signature, secret))) {
    return errorResponse(401, 'invalid_signature')
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return errorResponse(400, 'invalid_payload')
  }

  const event = parsePaddleEvent(payload)
  const paddleEventId = (payload as { event_id?: unknown })?.event_id
  const eventId = typeof paddleEventId === 'string' && paddleEventId !== ''
    ? paddleEventId
    : `${event.eventType}:${event.entityId ?? (await sha256Hex(rawBody))}`
  const supabase = serviceClient()

  // Store first — every event type, processed or not (§2.3).
  const { error: eventErr } = await supabase.from('webhook_events').insert({
    provider: PROVIDER,
    event_id: eventId,
    event_name: event.eventType,
    payload,
  })
  if (eventErr) {
    if (eventErr.code === '23505') return json(200, { ok: true }) // retry of a stored event
    console.error('webhook_events insert failed:', eventErr.message)
    return errorResponse(500, 'internal_error')
  }

  try {
    if (event.eventType === 'transaction.completed') await handleTransactionCompleted(supabase, event)
    else if (event.eventType.startsWith('adjustment.')) await handleRefund(supabase, event)
    // customer.* events are valuable purely as stored payloads (email source);
    // anything else: stored above, 200, no-op.

    await supabase.from('webhook_events').update({ processed_at: new Date().toISOString() }).eq('event_id', eventId)
    return json(200, { ok: true })
  } catch (err) {
    // Release the idempotency slot so the Paddle retry can reprocess.
    console.error('webhook processing failed:', err instanceof Error ? err.message : err)
    await supabase.from('webhook_events').delete().eq('event_id', eventId).is('processed_at', null)
    return errorResponse(500, 'internal_error')
  }
})
