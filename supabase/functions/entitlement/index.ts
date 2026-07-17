// POST /entitlement — issue a signed 7-day entitlement token for a device.
//
// Order of operations (§5.1 + Phase 1.5 §3): resolve active license
// (auto-claiming an unclaimed one by email if needed) → if the user holds no
// license at all, resolve the self-managed 14-day trial → upsert the device
// within the 3-slot limit → sign and return the JWT. License rules always
// win: a refunded/revoked license never falls through to a trial, so a
// refunded purchase cannot re-grant one. The client caches the token and
// verifies it offline; this endpoint is never called from the workflow
// execution path.

import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@2'
import { authenticateRequest, errorResponse, json, readJsonBody, serviceClient } from '../_shared/http.ts'
import {
  importEntitlementPrivateKey,
  signEntitlementToken,
} from '../_shared/entitlement-token.ts'
import { normalizeEmail } from '../_shared/util.ts'

export const MAX_ACTIVE_DEVICES = 3
export const TRIAL_DAYS = 14

const PLATFORMS = new Set(['windows', 'macos', 'linux'])
const FINGERPRINT_RE = /^[0-9a-f]{64}$/

// Key import happens once per isolate, not per request.
const privateKeyPromise = importEntitlementPrivateKey(Deno.env.get('ENTITLEMENT_PRIVATE_KEY') ?? '')

interface LicenseRow {
  id: string
  status: 'active' | 'refunded' | 'revoked'
  plan: string
  purchased_at: string
}

// Resolves the caller's active license, auto-claiming an unclaimed one whose
// buyer_email matches. Returns the license, the 403 the caller should send,
// or { none } when the user has no license in any status — only that last
// case may fall through to the trial path (Phase 1.5 §3a).
async function resolveLicense(
  supabase: SupabaseClient,
  user: User,
): Promise<{ license: LicenseRow } | { error: Response } | { none: true }> {
  const { data: own, error: ownErr } = await supabase
    .from('licenses')
    .select('id, status, plan, purchased_at')
    .eq('user_id', user.id)
    .order('purchased_at', { ascending: false })
  if (ownErr) throw ownErr

  const active = (own as LicenseRow[]).find((l) => l.status === 'active')
  if (active) return { license: active }

  // Auto-claim: attach the oldest unclaimed active license bought with this
  // email. The user_id IS NULL guard in the update makes the attach atomic —
  // a concurrent claim of the same row leaves exactly one winner.
  const email = normalizeEmail(user.email ?? '')
  if (email) {
    const { data: unclaimed, error: findErr } = await supabase
      .from('licenses')
      .select('id, status, plan, purchased_at')
      .is('user_id', null)
      .eq('buyer_email', email)
      .eq('status', 'active')
      .order('purchased_at', { ascending: true })
      .limit(1)
    if (findErr) throw findErr

    if (unclaimed && unclaimed.length > 0) {
      const { data: claimed, error: claimErr } = await supabase
        .from('licenses')
        .update({ user_id: user.id, claimed_at: new Date().toISOString() })
        .eq('id', unclaimed[0].id)
        .is('user_id', null)
        .select('id, status, plan, purchased_at')
      if (claimErr) throw claimErr
      if (claimed && claimed.length > 0) return { license: claimed[0] as LicenseRow }
    }
  }

  // No usable license. Report the most specific state we know: the user's own
  // most recent license, else an unclaimed one matching their email.
  let dead: LicenseRow | undefined = (own as LicenseRow[])[0]
  if (!dead && email) {
    const { data: unclaimedDead } = await supabase
      .from('licenses')
      .select('id, status, plan, purchased_at')
      .is('user_id', null)
      .eq('buyer_email', email)
      .order('purchased_at', { ascending: false })
      .limit(1)
    dead = (unclaimedDead as LicenseRow[] | null)?.[0]
  }
  if (dead?.status === 'refunded') return { error: errorResponse(403, 'license_refunded') }
  if (dead?.status === 'revoked') return { error: errorResponse(403, 'license_revoked') }
  return { none: true }
}

// Phase 1.5 §3b: the self-managed 14-day trial, reached only when the user
// holds no license in any status. One trial per account (primary key) and
// one per starting device (fingerprint soft block → support path).
async function resolveTrial(
  supabase: SupabaseClient,
  user: User,
  fingerprint: string,
): Promise<{ endsAt: string } | { error: Response }> {
  const { data: trial, error: findErr } = await supabase
    .from('trials')
    .select('ends_at')
    .eq('user_id', user.id)
    .maybeSingle()
  if (findErr) throw findErr

  if (trial) {
    if (Date.parse(trial.ends_at) > Date.now()) return { endsAt: trial.ends_at }
    return { error: errorResponse(403, 'trial_expired') }
  }

  // Soft device block: a fingerprint that already started a trial under any
  // account (it can't be this one — this user has no row) is denied.
  const { data: fpRows, error: fpErr } = await supabase
    .from('trials')
    .select('user_id')
    .eq('starting_fingerprint', fingerprint)
    .limit(1)
  if (fpErr) throw fpErr
  if (fpRows && fpRows.length > 0) return { error: errorResponse(403, 'trial_unavailable') }

  const endsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { error: insertErr } = await supabase
    .from('trials')
    .insert({ user_id: user.id, ends_at: endsAt, starting_fingerprint: fingerprint })
  if (insertErr) {
    // Primary-key race: a concurrent first call already created the trial.
    // Answer from the winning row.
    if (insertErr.code === '23505') {
      const { data: raced } = await supabase
        .from('trials').select('ends_at').eq('user_id', user.id).maybeSingle()
      if (raced && Date.parse(raced.ends_at) > Date.now()) return { endsAt: raced.ends_at }
      return { error: errorResponse(403, 'trial_expired') }
    }
    throw insertErr
  }
  return { endsAt }
}

interface DeviceFields {
  fingerprint: string
  name: string | null
  platform: string | null
  appVersion: string | null
}

// 'activate' is a user-initiated acquire (sign-in, or the modal retry after
// freeing a slot): it may reactivate a revoked device or create a new one.
// 'refresh' is the app's background heartbeat while online: it only re-validates
// an already-active device and NEVER resurrects a removed one — so deactivating
// a device kills it on its next check-in instead of after the token's 7-day
// grace. The grace only ever covers being offline, not being removed.
export type EntitlementMode = 'activate' | 'refresh'

// Upserts the device on (user_id, fingerprint_hash) within the 3-slot limit.
// Returns the device id or the 409 response listing the active devices.
async function upsertDevice(
  supabase: SupabaseClient,
  user: User,
  fields: DeviceFields,
  mode: EntitlementMode,
): Promise<{ deviceId: string } | { error: Response }> {
  const now = new Date().toISOString()
  const { data: existing, error: findErr } = await supabase
    .from('devices')
    .select('id, revoked_at')
    .eq('user_id', user.id)
    .eq('fingerprint_hash', fields.fingerprint)
    .maybeSingle()
  if (findErr) throw findErr

  if (existing && existing.revoked_at === null) {
    const { error } = await supabase
      .from('devices')
      .update({ last_seen_at: now, app_version: fields.appVersion, name: fields.name })
      .eq('id', existing.id)
    if (error) throw error
    return { deviceId: existing.id }
  }

  // Past here the device is revoked or brand-new. A background refresh must not
  // resurrect it or take a slot: a removed device stops working the instant it
  // reaches the server again, with no offline-grace carryover.
  if (mode === 'refresh') {
    return { error: errorResponse(403, 'device_revoked') }
  }

  // New activation (fresh fingerprint, or a previously revoked device coming
  // back): both consume a slot, so both are subject to the limit.
  const { data: activeDevices, error: countErr } = await supabase
    .from('devices')
    .select('id, name, platform, last_seen_at')
    .eq('user_id', user.id)
    .is('revoked_at', null)
    .order('last_seen_at', { ascending: false })
  if (countErr) throw countErr

  if (activeDevices.length >= MAX_ACTIVE_DEVICES) {
    // The client offers deactivation from this list.
    return { error: errorResponse(409, 'device_limit', { devices: activeDevices }) }
  }

  if (existing) {
    const { error } = await supabase
      .from('devices')
      .update({ revoked_at: null, last_seen_at: now, app_version: fields.appVersion, name: fields.name })
      .eq('id', existing.id)
    if (error) throw error
    return { deviceId: existing.id }
  }

  const { data: created, error: insertErr } = await supabase
    .from('devices')
    .insert({
      user_id: user.id,
      fingerprint_hash: fields.fingerprint,
      name: fields.name,
      platform: fields.platform,
      app_version: fields.appVersion,
    })
    .select('id')
    .single()
  if (insertErr) throw insertErr
  return { deviceId: created.id }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return errorResponse(405, 'method_not_allowed')

  const supabase = serviceClient()
  const user = await authenticateRequest(req, supabase)
  if (!user) return errorResponse(401, 'unauthorized')

  const body = await readJsonBody(req)
  const fingerprint = typeof body?.fingerprint === 'string' ? body.fingerprint.toLowerCase() : ''
  if (!FINGERPRINT_RE.test(fingerprint)) return errorResponse(400, 'invalid_request')
  const platform = typeof body?.platform === 'string' && PLATFORMS.has(body.platform) ? body.platform : null
  const name = typeof body?.device_name === 'string' ? body.device_name.slice(0, 120) : null
  const appVersion = typeof body?.app_version === 'string' ? body.app_version.slice(0, 40) : null
  // Default to 'activate' so any older client (which sends no mode) keeps its
  // current behaviour; only the app's background heartbeat opts into 'refresh'.
  const mode: EntitlementMode = body?.mode === 'refresh' ? 'refresh' : 'activate'

  try {
    const resolved = await resolveLicense(supabase, user)
    if ('error' in resolved) return resolved.error

    let plan: string
    let notAfter: number | undefined
    let trialEndsAt: number | undefined
    if ('license' in resolved) {
      plan = resolved.license.plan
    } else {
      const trial = await resolveTrial(supabase, user, fingerprint)
      if ('error' in trial) return trial.error
      plan = 'trial'
      // The token must never outlive the trial (Phase 1.5 §3)...
      trialEndsAt = Math.floor(Date.parse(trial.endsAt) / 1000)
      // ...but exp is also capped at 7 days, so it can't double as the
      // countdown: the client gets the real end as its own signed claim.
      notAfter = trialEndsAt
    }

    const device = await upsertDevice(supabase, user, { fingerprint, name, platform, appVersion }, mode)
    if ('error' in device) return device.error

    const { token, expiresAt } = await signEntitlementToken(await privateKeyPromise, {
      userId: user.id,
      deviceId: device.deviceId,
      plan,
      notAfter,
      trialEndsAt,
    })
    return json(200, { token, expires_at: expiresAt })
  } catch (err) {
    console.error('entitlement error:', err instanceof Error ? err.message : err)
    return errorResponse(500, 'internal_error')
  }
})
