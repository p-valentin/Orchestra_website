// GET  /devices            — list the caller's devices (revoked included)
// POST /devices/deactivate — revoke one of the caller's devices
//
// Deactivation frees an activation slot for future /entitlement calls but
// does NOT invalidate an entitlement token already cached on that device —
// the token simply expires within ≤ 7 days. Accepted by design (§5.3): the
// alternative would put a server check back into the client's hot path.

import { authenticateRequest, errorResponse, json, readJsonBody, serviceClient } from '../_shared/http.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  const supabase = serviceClient()
  const user = await authenticateRequest(req, supabase)
  if (!user) return errorResponse(401, 'unauthorized')

  const path = new URL(req.url).pathname

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('devices')
        .select('id, name, platform, app_version, last_seen_at, revoked_at')
        .eq('user_id', user.id)
        .order('last_seen_at', { ascending: false })
      if (error) throw error
      return json(200, { devices: data })
    }

    if (req.method === 'POST' && path.endsWith('/deactivate')) {
      const body = await readJsonBody(req)
      const deviceId = typeof body?.device_id === 'string' ? body.device_id : ''
      if (!UUID_RE.test(deviceId)) return errorResponse(400, 'invalid_request')

      // Scoped to the caller: someone else's device id looks identical to a
      // nonexistent one (404), leaking nothing.
      const { data: device, error: findErr } = await supabase
        .from('devices')
        .select('id, revoked_at')
        .eq('id', deviceId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (findErr) throw findErr
      if (!device) return errorResponse(404, 'not_found')

      // Idempotent: an already-revoked device keeps its original revoked_at.
      if (device.revoked_at === null) {
        const { error } = await supabase
          .from('devices')
          .update({ revoked_at: new Date().toISOString() })
          .eq('id', device.id)
        if (error) throw error
      }
      return json(200, { ok: true })
    }

    return errorResponse(405, 'method_not_allowed')
  } catch (err) {
    console.error('devices error:', err instanceof Error ? err.message : err)
    return errorResponse(500, 'internal_error')
  }
})
