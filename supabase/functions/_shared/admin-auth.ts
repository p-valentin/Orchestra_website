// Request authentication for the admin data endpoint.
//
// A static bearer secret was rejected for this: the endpoint returns customer
// PII and commercial history, and a static token is replayable forever by
// anyone who ever sees it — a log line, a proxy, a screenshot, an old env dump.
// Instead every request is SIGNED and EXPIRES, the same scheme the payment
// webhooks use, pointed the other way:
//
//   sig = HMAC-SHA256( "<ts>.<method>.<path>.<sha256(body)>", ADMIN_DATA_SECRET )
//
// Consequences that matter:
//   - a captured request is useless after the freshness window;
//   - the signature covers the method and path, so a token minted for a
//     read cannot be replayed against a different route;
//   - the body hash is included so nothing can be appended to a signed request.
//
// Replay INSIDE the window is not separately defended, deliberately: the
// endpoint is read-only and idempotent, so replaying it returns data the
// attacker already had. Adding a nonce store would buy nothing and cost a
// round-trip on every admin page load.
//
// Every failure is a 404 rather than a 401 — an unauthenticated prober should
// not be able to tell this function exists, let alone that it guards something
// worth guessing at.

const FRESHNESS_SECONDS = 60

// Secrets shorter than this are refused outright rather than quietly accepted:
// the whole scheme rests on this value being unguessable.
const MIN_SECRET_LENGTH = 32

// The signature binds the request to THIS function, but it cannot bind to the
// literal pathname: the gateway and the local runtime disagree about whether
// the function sees /functions/v1/admin-data or /admin-data. Signing the last
// segment keeps the property that matters — a signature minted for one
// function is not replayable against another — without depending on a routing
// detail that differs between environments.
export function canonicalPath(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean)
  return `/${parts[parts.length - 1] ?? ''}`
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

function base64ToBytes(b64: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null
  try {
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  } catch {
    return null
  }
}

export async function signAdminRequest(
  secret: string,
  method: string,
  path: string,
  body: string,
  ts: number = Math.floor(Date.now() / 1000),
): Promise<Record<string, string>> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const content = `${ts}.${method.toUpperCase()}.${canonicalPath(path)}.${await sha256Hex(body)}`
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(content))
  return {
    'x-orchestra-ts': String(ts),
    'x-orchestra-sig': `v1,${btoa(String.fromCharCode(...new Uint8Array(mac)))}`,
  }
}

export async function verifyAdminRequest(
  req: Request,
  body: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!secret || secret.length < MIN_SECRET_LENGTH) return false

  const ts = req.headers.get('x-orchestra-ts')
  const sig = req.headers.get('x-orchestra-sig')
  if (!ts || !sig || !/^\d+$/.test(ts)) return false
  if (Math.abs(nowSeconds - Number(ts)) > FRESHNESS_SECONDS) return false

  const comma = sig.indexOf(',')
  if (comma === -1 || sig.slice(0, comma) !== 'v1') return false
  const provided = base64ToBytes(sig.slice(comma + 1))
  if (!provided) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const url = new URL(req.url)
  const content = `${Number(ts)}.${req.method.toUpperCase()}.${canonicalPath(url.pathname)}.${await sha256Hex(body)}`
  // crypto.subtle.verify is constant-time.
  return await crypto.subtle.verify('HMAC', key, provided.buffer as ArrayBuffer, new TextEncoder().encode(content))
}
