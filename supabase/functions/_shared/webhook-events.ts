// Provider-agnostic webhook_events plumbing: idempotency and retention.
//
// Extracted so a second processor doesn't get a second copy of the dedupe
// dance, which is subtle enough that a drifting duplicate would be a real bug.
// webhooks-paddle still carries its own inline copy of this logic — it is
// security-reviewed and shipping, so it stays untouched until Polar replaces
// it; at that point this module is the single implementation.
//
// Retention is the SAME mechanism the Paddle path uses, not a second one: one
// table, one 24-month cutoff (what the privacy policy commits to for raw
// payment notifications), pruned opportunistically after a successful
// delivery. Adding a provider adds a caller, not a policy.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

// 24 months, in the average-month terms the privacy policy's "24 months" means.
const RETENTION_MS = 24 * 30.44 * 24 * 60 * 60 * 1000

export type StoreOutcome =
  // Fresh event — process it.
  | 'stored'
  // Duplicate whose stored row still has processed_at null: an earlier attempt
  // died between the insert and its compensating delete. Process it on THIS
  // delivery — returning 200 would stop the provider's retries and lose the
  // purchase forever. A concurrent still-in-flight first attempt can
  // double-process down this path, which is why every handler is idempotent;
  // at worst the claim email sends twice.
  | 'reprocess'
  // Duplicate of a completed event — 200 and stop.
  | 'done'
  // Insert or dedupe read failed, or the row was already released by a failing
  // concurrent attempt — 500 so the next retry re-inserts cleanly.
  | 'error'

// Stores the event before anything is processed (§2.3): every event type,
// actionable or not.
export async function storeEvent(
  supabase: SupabaseClient,
  provider: string,
  eventId: string,
  eventName: string,
  payload: unknown,
): Promise<StoreOutcome> {
  const { error } = await supabase.from('webhook_events').insert({
    provider,
    event_id: eventId,
    event_name: eventName,
    payload,
  })
  if (!error) return 'stored'
  if (error.code !== '23505') {
    console.error('webhook_events insert failed:', error.message)
    return 'error'
  }

  const { data: prior, error: priorErr } = await supabase
    .from('webhook_events')
    .select('processed_at')
    .eq('provider', provider)
    .eq('event_id', eventId)
    .maybeSingle()
  if (priorErr) {
    console.error('webhook_events dedupe read failed:', priorErr.message)
    return 'error'
  }
  if (!prior) return 'error'
  return prior.processed_at !== null ? 'done' : 'reprocess'
}

export async function markProcessed(
  supabase: SupabaseClient,
  provider: string,
  eventId: string,
): Promise<void> {
  await supabase
    .from('webhook_events')
    .update({ processed_at: new Date().toISOString() })
    .eq('provider', provider)
    .eq('event_id', eventId)
}

// Frees the idempotency slot after a failed processing attempt so the
// provider's retry can reprocess instead of being swallowed by the dedupe.
// Scoped to processed_at null so it can never delete a completed event.
export async function releaseEvent(
  supabase: SupabaseClient,
  provider: string,
  eventId: string,
): Promise<void> {
  await supabase
    .from('webhook_events')
    .delete()
    .eq('provider', provider)
    .eq('event_id', eventId)
    .is('processed_at', null)
}

// Data-minimisation: raw payloads carry buyer details we don't need forever.
// Best-effort — a failure here never fails the webhook. Not provider-scoped on
// purpose: one sweep covers every provider's rows.
export async function pruneOldEvents(supabase: SupabaseClient): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_MS).toISOString()
  const { error } = await supabase
    .from('webhook_events')
    .delete()
    .lt('received_at', cutoff)
    .not('processed_at', 'is', null)
  if (error) console.error('webhook_events prune failed:', error.message)
}
