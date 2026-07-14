// POST /claim-legacy — redeem an old-format Orchestra license key as proof of
// purchase, creating (or re-attaching to) a row in `licenses`.
//
// The claimant's account email does NOT need to match the token's email —
// holding a validly signed token IS the proof; customers bought before
// accounts existed. Legacy tokens are secrets: only their sha256 hash is ever
// stored, and the raw token must never be logged.

import { authenticateRequest, errorResponse, json, readJsonBody, serviceClient } from '../_shared/http.ts'
import { importLegacyPublicKey, verifyLegacyToken } from '../_shared/legacy.ts'
import { sha256Hex } from '../_shared/util.ts'

// Key import happens once per isolate, not per request.
const publicKeyPromise = importLegacyPublicKey(Deno.env.get('LEGACY_SIGNING_KEY') ?? '')

Deno.serve(async (req) => {
  if (req.method !== 'POST') return errorResponse(405, 'method_not_allowed')

  const supabase = serviceClient()
  const user = await authenticateRequest(req, supabase)
  if (!user) return errorResponse(401, 'unauthorized')

  const body = await readJsonBody(req)
  // Trimmed so a stray space from copy-paste doesn't change the stored hash.
  const legacyToken = typeof body?.legacy_token === 'string' ? body.legacy_token.trim() : ''
  if (!legacyToken) return errorResponse(400, 'invalid_token')

  try {
    // Signature check first — an invalid token must not even cost a lookup.
    const verified = await verifyLegacyToken(legacyToken, await publicKeyPromise)
    if (!verified.ok) return errorResponse(400, 'invalid_token')

    const tokenHash = await sha256Hex(legacyToken)

    const { data: existing, error: findErr } = await supabase
      .from('licenses')
      .select('id, user_id')
      .eq('legacy_token_hash', tokenHash)
      .maybeSingle()
    if (findErr) throw findErr

    if (existing) {
      if (existing.user_id === user.id) return json(200, { ok: true }) // idempotent re-claim
      if (existing.user_id !== null) return errorResponse(409, 'already_claimed') // manual support path — no auto-transfer

      // Pre-seeded but unclaimed row: attach it. The user_id IS NULL guard
      // keeps a concurrent claim from stealing it back and forth.
      const { data: attached, error: attachErr } = await supabase
        .from('licenses')
        .update({ user_id: user.id, claimed_at: new Date().toISOString() })
        .eq('id', existing.id)
        .is('user_id', null)
        .select('id')
      if (attachErr) throw attachErr
      if (!attached || attached.length === 0) return errorResponse(409, 'already_claimed')
      return json(200, { ok: true })
    }

    const { error: insertErr } = await supabase.from('licenses').insert({
      legacy_token_hash: tokenHash,
      buyer_email: verified.claim.email, // already normalized by verifyLegacyToken
      plan: 'lifetime',
      status: 'active',
      purchased_at: new Date(verified.claim.issuedAt).toISOString(),
      user_id: user.id,
      claimed_at: new Date().toISOString(),
    })
    if (insertErr) {
      // Unique violation on legacy_token_hash: a concurrent request inserted
      // the row between our lookup and insert. Re-read and answer as if we
      // had found it in the first place.
      if (insertErr.code === '23505') {
        const { data: raced } = await supabase
          .from('licenses')
          .select('user_id')
          .eq('legacy_token_hash', tokenHash)
          .maybeSingle()
        if (raced?.user_id === user.id) return json(200, { ok: true })
        return errorResponse(409, 'already_claimed')
      }
      throw insertErr
    }
    return json(200, { ok: true })
  } catch (err) {
    // Never log the token itself — message/code only.
    console.error('claim-legacy error:', err instanceof Error ? err.message : 'unknown')
    return errorResponse(500, 'internal_error')
  }
})
