// POST /entitlement — issue a signed 7-day entitlement token for a device.
//
// Order of operations (§5.1): resolve active license (auto-claiming an
// unclaimed one by email if needed) → upsert the device within the 3-slot
// limit → sign and return the JWT. The client caches the token and verifies
// it offline; this endpoint is never called from the workflow execution path.

import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@2'
import { authenticateRequest, errorResponse, json, readJsonBody, serviceClient } from '../_shared/http.ts'
import {
  importEntitlementPrivateKey,
  signEntitlementToken,
} from '../_shared/entitlement-token.ts'
import { normalizeEmail } from '../_shared/util.ts'

export const MAX_ACTIVE_DEVICES = 3

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
// buyer_email matches. Returns the license or the 403 the caller should send.
async function resolveLicense(
  supabase: SupabaseClient,
  user: User,
): Promise<{ license: LicenseRow } | { error: Response }> {
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
  return { error: errorResponse(403, 'no_license') }
}

interface DeviceFields {
  fingerprint: string
  name: string | null
  platform: string | null
  appVersion: string | null
}

// Upserts the device on (user_id, fingerprint_hash) within the 3-slot limit.
// Returns the device id or the 409 response listing the active devices.
async function upsertDevice(
  supabase: SupabaseClient,
  user: User,
  fields: DeviceFields,
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

  try {
    const resolved = await resolveLicense(supabase, user)
    if ('error' in resolved) return resolved.error

    const device = await upsertDevice(supabase, user, { fingerprint, name, platform, appVersion })
    if ('error' in device) return device.error

    const { token, expiresAt } = await signEntitlementToken(await privateKeyPromise, {
      userId: user.id,
      deviceId: device.deviceId,
      plan: resolved.license.plan,
    })
    return json(200, { token, expires_at: expiresAt })
  } catch (err) {
    console.error('entitlement error:', err instanceof Error ? err.message : err)
    return errorResponse(500, 'internal_error')
  }
})
