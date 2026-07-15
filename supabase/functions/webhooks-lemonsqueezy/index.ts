// POST /webhooks-lemonsqueezy — the ONLY writer of Lemon Squeezy-originated
// license rows (§2.1). Public endpoint (verify_jwt = false in config.toml);
// authentication is the HMAC signature, verified on the raw body before
// anything else.
//
// Idempotency (§2.2): every event is inserted into webhook_events first;
// a unique-constraint hit means already processed → 200 and stop. If
// processing fails AFTER that insert, the event row is deleted before
// returning 500 — otherwise the LS retry would hit the dedupe and the event
// would be lost forever.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { errorResponse, json, serviceClient } from '../_shared/http.ts'
import { parseLsEvent, verifyLsSignature, type LsEvent } from '../_shared/lemonsqueezy.ts'
import { sendClaimEmail } from '../_shared/resend.ts'
import { sha256Hex } from '../_shared/util.ts'

const PROVIDER = 'lemonsqueezy'

// §3.4 order_created, only for paid orders. The insert is conflict-ignoring:
// it must never overwrite an existing row (a refund that arrived first stays
// refunded — §3.4 order_refunded / test 35).
async function handleOrderCreated(supabase: SupabaseClient, event: LsEvent): Promise<void> {
  if (event.orderStatus !== 'paid') return // pending/failed orders: stored, no-op
  if (!event.orderId || !event.buyerEmail) return // unprocessable shape: stored, no-op

  const { error: insertErr } = await supabase
    .from('licenses')
    .upsert(
      { ls_order_id: event.orderId, buyer_email: event.buyerEmail, status: 'active', plan: 'lifetime' },
      { onConflict: 'ls_order_id', ignoreDuplicates: true },
    )
  if (insertErr) throw insertErr

  const { data: license, error: readErr } = await supabase
    .from('licenses')
    .select('id, status, user_id')
    .eq('ls_order_id', event.orderId)
    .single()
  if (readErr) throw readErr
  if (license.status !== 'active') return // pre-existing refunded row: no attach, no email

  // §3.4c: buyer already has an account → attach immediately.
  if (license.user_id === null) {
    const { data: userId, error: lookupErr } = await supabase.rpc('user_id_by_email', {
      p_email: event.buyerEmail,
    })
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

  // §3.4d + §2.4: best-effort only. sendClaimEmail never throws.
  await sendClaimEmail(event.buyerEmail, event.orderNumber)
}

// §3.4 order_refunded — including out-of-order delivery: no matching license
// yet means the refund creates the row, so a late order_created can't
// resurrect it.
async function handleOrderRefunded(supabase: SupabaseClient, event: LsEvent): Promise<void> {
  if (!event.orderId) return

  const { data: updated, error: updateErr } = await supabase
    .from('licenses')
    .update({ status: 'refunded' })
    .eq('ls_order_id', event.orderId)
    .select('id')
  if (updateErr) throw updateErr
  if (updated && updated.length > 0) return

  const { error: insertErr } = await supabase.from('licenses').insert({
    ls_order_id: event.orderId,
    buyer_email: event.buyerEmail ?? '', // not-null column; refund payloads carry the email in practice
    status: 'refunded',
    plan: 'lifetime',
  })
  if (insertErr) {
    // Race with a concurrent order_created: the row appeared between our
    // update and insert — flip it.
    if (insertErr.code === '23505') {
      const { error } = await supabase
        .from('licenses').update({ status: 'refunded' }).eq('ls_order_id', event.orderId)
      if (error) throw error
      return
    }
    throw insertErr
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return errorResponse(405, 'method_not_allowed')

  // §3.1: signature first, over the raw body, before any parsing.
  const rawBody = await req.text()
  const signature = req.headers.get('X-Signature') ?? ''
  const secret = Deno.env.get('LS_WEBHOOK_SECRET') ?? ''
  if (!(await verifyLsSignature(rawBody, signature, secret))) {
    return errorResponse(401, 'invalid_signature')
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return errorResponse(400, 'invalid_payload')
  }

  const event = parseLsEvent(payload, req.headers.get('X-Event-Name'))
  const eventId = `${event.eventName}:${event.orderId ?? (await sha256Hex(rawBody))}`
  const supabase = serviceClient()

  // §2.2/§2.3: store first — every event type, processed or not.
  const { error: eventErr } = await supabase.from('webhook_events').insert({
    provider: PROVIDER,
    event_id: eventId,
    event_name: event.eventName,
    payload,
  })
  if (eventErr) {
    if (eventErr.code === '23505') return json(200, { ok: true }) // retry of a stored event
    console.error('webhook_events insert failed:', eventErr.message)
    return errorResponse(500, 'internal_error')
  }

  try {
    if (event.eventName === 'order_created') await handleOrderCreated(supabase, event)
    else if (event.eventName === 'order_refunded') await handleOrderRefunded(supabase, event)
    // anything else (§3.4): stored above, 200, no-op

    await supabase.from('webhook_events').update({ processed_at: new Date().toISOString() }).eq('event_id', eventId)
    return json(200, { ok: true })
  } catch (err) {
    // Release the idempotency slot so the LS retry can reprocess.
    console.error('webhook processing failed:', err instanceof Error ? err.message : err)
    await supabase.from('webhook_events').delete().eq('event_id', eventId).is('processed_at', null)
    return errorResponse(500, 'internal_error')
  }
})
