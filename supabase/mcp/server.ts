// MCP server for exercising the Phase 1 license backend by hand.
//
// Exposes tools to create test users, seed licenses, mint legacy tokens
// (with the throwaway test keys), call the three Edge Functions, inspect the
// license tables, and clean up afterwards. Registered in .mcp.json; run
// directly with:  cd supabase && deno run -A mcp/server.ts
// (must run under supabase/deno.json — from the repo root, the website's
// package.json puts Deno in node_modules resolution mode and drops deno.ns)
//
// It talks to whatever stack the environment points at — the local
// `supabase start` stack (auto-discovered via `supabase status -o env`) or a
// hosted project (set SUPABASE_URL / SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY). It is a TEST harness: everything it creates is
// tracked so cleanup_test_data can remove it.

import { McpServer } from 'npm:@modelcontextprotocol/sdk@1.12.1/server/mcp.js'
import { StdioServerTransport } from 'npm:@modelcontextprotocol/sdk@1.12.1/server/stdio.js'
import { z } from 'npm:zod@3.25.76'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { decodeJwt, importJWK, jwtVerify, type JWK } from 'npm:jose@5.9.6'
import {
  ENTITLEMENT_AUDIENCE,
  ENTITLEMENT_ISSUER,
} from '../functions/_shared/entitlement-token.ts'
import { setupTestEnv } from '../../scripts/setup-test-env.ts'

// ---------- stack configuration ----------

interface StackConfig {
  url: string
  anonKey: string
  serviceRoleKey: string
  source: string
}

let cachedConfig: StackConfig | null = null

async function supabaseStatusEnv(): Promise<Record<string, string>> {
  try {
    const cmd = new Deno.Command('supabase', { args: ['status', '-o', 'env'], stdout: 'piped', stderr: 'null' })
    const out = await cmd.output()
    if (!out.success) return {}
    const vars: Record<string, string> = {}
    for (const line of new TextDecoder().decode(out.stdout).split('\n')) {
      const m = line.match(/^([A-Z_]+)=["']?([^"']*)["']?\s*$/)
      if (m) vars[m[1]] = m[2]
    }
    return vars
  } catch {
    return {}
  }
}

async function resolveConfig(): Promise<StackConfig> {
  if (cachedConfig) return cachedConfig
  const env = (name: string) => Deno.env.get(name)

  let url = env('SUPABASE_URL')
  let anonKey = env('SUPABASE_ANON_KEY')
  let serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY')
  let source = 'environment'

  if (!url || !anonKey || !serviceRoleKey) {
    const status = await supabaseStatusEnv()
    url ??= status.API_URL ?? status.SUPABASE_URL
    anonKey ??= status.ANON_KEY ?? status.SUPABASE_ANON_KEY
    serviceRoleKey ??= status.SERVICE_ROLE_KEY ?? status.SUPABASE_SERVICE_ROLE_KEY
    source = 'supabase status'
  }

  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error(
      'Stack not configured. Either run `supabase start` (local), or set ' +
        'SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY (hosted).',
    )
  }

  // This server exposes destructive tools (cleanup_test_data deletes auth
  // users and license rows; set_license_status rewrites licenses). It must
  // never point at a real project by accident: anything non-local requires an
  // explicit opt-in.
  const host = new URL(url).hostname
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1' ||
    host === 'host.docker.internal'
  if (!isLocal && Deno.env.get('ORCHESTRA_TEST_ALLOW_REMOTE') !== '1') {
    throw new Error(
      `Refusing to run against non-local stack "${host}". This harness deletes users and ` +
        'licenses; set ORCHESTRA_TEST_ALLOW_REMOTE=1 only if that project is disposable.',
    )
  }

  cachedConfig = { url, anonKey, serviceRoleKey, source }
  return cachedConfig
}

async function admin(): Promise<SupabaseClient> {
  const cfg = await resolveConfig()
  return createClient(cfg.url, cfg.serviceRoleKey, { auth: { persistSession: false } })
}

// ---------- session registry (for chaining tools + cleanup) ----------

interface RegisteredUser {
  id: string
  email: string
  accessToken: string
}

const users = new Map<string, RegisteredUser>() // by email
const seededLicenseIds = new Set<string>()
const fingerprints = new Map<string, string>() // `${email}|${device_name}` → stable fingerprint
const paddleTxnIds = new Set<string>() // transactions simulated via send_paddle_webhook
const paddleEventIds = new Set<string>() // webhook_events rows those calls created

function getUser(email: string): RegisteredUser {
  const user = users.get(email.toLowerCase().trim())
  if (!user) {
    const known = [...users.keys()].join(', ') || '(none yet — use create_test_user)'
    throw new Error(`No test user '${email}' in this session. Known users: ${known}`)
  }
  return user
}

function randomFingerprint(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

// ---------- test keys (.keys.test.json from setup-test-env) ----------

const KEYS_PATH = new URL('../tests/.keys.test.json', import.meta.url)

interface TestKeys {
  legacyPrivateKeyPkcs8B64: string
  entitlementPublicJwk: JWK
}

async function loadTestKeys(): Promise<TestKeys> {
  try {
    return JSON.parse(await Deno.readTextFile(KEYS_PATH)) as TestKeys
  } catch {
    throw new Error('Missing supabase/tests/.keys.test.json — run the setup_test_keys tool first.')
  }
}

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Mirrors the website's lib/token.ts: signature over the UTF-8 bytes of the
// base64url body STRING.
async function signLegacy(payload: Record<string, unknown>, privateKeyPkcs8B64: string): Promise<string> {
  const der = Uint8Array.from(atob(privateKeyPkcs8B64), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', der.buffer as ArrayBuffer, 'Ed25519', false, ['sign'])
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)))
  const sig = await crypto.subtle.sign('Ed25519', key, new TextEncoder().encode(body))
  return `${body}.${b64url(new Uint8Array(sig))}`
}

// ---------- edge function calls ----------

async function callFn(
  path: string,
  opts: { method?: string; accessToken?: string; body?: unknown },
): Promise<{ status: number; body: unknown }> {
  const cfg = await resolveConfig()
  const headers: Record<string, string> = { 'Content-Type': 'application/json', apikey: cfg.anonKey }
  if (opts.accessToken) headers['Authorization'] = `Bearer ${opts.accessToken}`
  const res = await fetch(`${cfg.url}/functions/v1/${path}`, {
    method: opts.method ?? 'POST',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  const text = await res.text()
  let body: unknown
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = { raw: text }
  }
  return { status: res.status, body }
}

// ---------- tool plumbing ----------

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean }

function ok(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

// deno-lint-ignore no-explicit-any
function tool(handler: (args: any) => Promise<unknown>): (args: any) => Promise<ToolResult> {
  return async (args) => {
    try {
      return ok(await handler(args))
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      }
    }
  }
}

const server = new McpServer({ name: 'orchestra-license-test', version: '1.0.0' })

// ---------- tools ----------

server.registerTool(
  'stack_status',
  {
    description:
      'Check what the license-test tools are pointed at: stack URL, auth health, whether the three Edge Functions are reachable, and whether test signing keys exist.',
    inputSchema: {},
  },
  tool(async () => {
    let cfg: StackConfig
    try {
      cfg = await resolveConfig()
    } catch (err) {
      return { configured: false, problem: err instanceof Error ? err.message : String(err) }
    }

    const result: Record<string, unknown> = { configured: true, url: cfg.url, config_source: cfg.source }
    try {
      const health = await fetch(`${cfg.url}/auth/v1/health`, { headers: { apikey: cfg.anonKey } })
      result.auth_health = health.status
      await health.body?.cancel()
    } catch (err) {
      result.auth_health = `unreachable: ${err instanceof Error ? err.message : err}`
    }
    for (const fn of ['entitlement', 'devices', 'claim-legacy']) {
      try {
        // Unauthenticated probe: 401 means deployed/served; anything else is reported as-is.
        const res = await callFn(fn, { body: {} })
        result[`fn_${fn}`] = res.status === 401 ? 'reachable (401 unauthenticated, as expected)' : `status ${res.status}`
      } catch (err) {
        result[`fn_${fn}`] = `unreachable: ${err instanceof Error ? err.message : err}`
      }
    }
    result.test_keys_file = await Deno.stat(KEYS_PATH).then(() => 'present').catch(() => 'missing — run setup_test_keys')
    result.session = { test_users: [...users.keys()], seeded_licenses: seededLicenseIds.size }
    return result
  }),
)

server.registerTool(
  'setup_test_keys',
  {
    description:
      'Generate throwaway Ed25519 keypairs and write supabase/functions/.env.test (for `supabase functions serve --env-file`) and supabase/tests/.keys.test.json (used by mint_legacy_token and JWT verification). Restart `functions serve` after regenerating.',
    inputSchema: {},
  },
  tool(async () => {
    const files = await setupTestEnv()
    return {
      ...files,
      next_step: 'supabase functions serve --env-file supabase/functions/.env.test',
      note: 'If functions serve is already running with old keys, restart it or signatures will not match.',
    }
  }),
)

server.registerTool(
  'create_test_user',
  {
    description:
      'Create a confirmed Supabase Auth user and sign in, returning its access token. The user is remembered by email for the other tools and removed by cleanup_test_data.',
    inputSchema: {
      email: z.string().optional().describe('Defaults to a unique @phase1.test address'),
    },
  },
  tool(async ({ email }: { email?: string }) => {
    const cfg = await resolveConfig()
    const finalEmail = (email ?? `mcp-${crypto.randomUUID().slice(0, 8)}@phase1.test`).toLowerCase().trim()
    const password = 'phase1-mcp-password-123!'

    const adm = await admin()
    const { error: createErr } = await adm.auth.admin.createUser({
      email: finalEmail,
      password,
      email_confirm: true,
    })
    // "already registered" is fine — a user left over from an earlier server
    // process is adopted by signing in with the shared test password.

    const anon = createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false } })
    const { data: session, error: signInErr } = await anon.auth.signInWithPassword({ email: finalEmail, password })
    if (signInErr || !session.session) {
      throw new Error(`signIn failed: ${signInErr?.message}${createErr ? ` (createUser: ${createErr.message})` : ''}`)
    }

    const userId = session.session.user.id
    users.set(finalEmail, { id: userId, email: finalEmail, accessToken: session.session.access_token })
    return { user_id: userId, email: finalEmail, note: 'Pass this email as user_email to the other tools.' }
  }),
)

server.registerTool(
  'seed_license',
  {
    description:
      'Insert a license row via the service role (what a Paddle purchase or pre-seeded legacy import would create). Leave claim_for_user_email unset to test email auto-claim.',
    inputSchema: {
      buyer_email: z.string().describe('Purchase email; auto-claim matches it against the account email'),
      status: z.enum(['active', 'refunded', 'revoked']).optional().describe('Default active'),
      claim_for_user_email: z.string().optional().describe('Attach to this test user (sets user_id + claimed_at)'),
      legacy_token: z.string().optional().describe('Store this token’s sha256 as the origin instead of a fake order id'),
    },
  },
  tool(async ({ buyer_email, status, claim_for_user_email, legacy_token }: {
    buyer_email: string
    status?: 'active' | 'refunded' | 'revoked'
    claim_for_user_email?: string
    legacy_token?: string
  }) => {
    const adm = await admin()
    const user = claim_for_user_email ? getUser(claim_for_user_email) : null
    const row = {
      buyer_email: buyer_email.toLowerCase().trim(),
      status: status ?? 'active',
      user_id: user?.id ?? null,
      claimed_at: user ? new Date().toISOString() : null,
      order_id: legacy_token ? null : `mcp-test-${crypto.randomUUID()}`,
      legacy_token_hash: legacy_token ? await sha256Hex(legacy_token.trim()) : null,
    }
    const { data, error } = await adm.from('licenses').insert(row).select('*').single()
    if (error) throw new Error(`insert failed: ${error.message}`)
    seededLicenseIds.add(data.id)
    return data
  }),
)

server.registerTool(
  'mint_legacy_token',
  {
    description:
      'Sign a legacy-format license token with the throwaway test key (needs setup_test_keys; the served functions must use the matching .env.test). Options mimic real-world cases: app tokens (include_exp), trial plan, or a tampered signature.',
    inputSchema: {
      email: z.string().describe('Email embedded in the token payload'),
      plan: z.string().optional().describe("Default 'lifetime'; use 'trial' to test rejection"),
      issued_at_ms: z.number().optional().describe('Epoch ms; default now'),
      include_exp: z.boolean().optional().describe('Add an exp field like the website’s 14-day app tokens — must be rejected'),
      tamper: z.boolean().optional().describe('Corrupt the payload after signing — must be rejected as invalid_token'),
    },
  },
  tool(async ({ email, plan, issued_at_ms, include_exp, tamper }: {
    email: string
    plan?: string
    issued_at_ms?: number
    include_exp?: boolean
    tamper?: boolean
  }) => {
    const keys = await loadTestKeys()
    const issuedAt = issued_at_ms ?? Date.now()
    const payload: Record<string, unknown> = { email, plan: plan ?? 'lifetime', issuedAt }
    if (include_exp) payload.exp = issuedAt + 14 * 24 * 60 * 60 * 1000
    let token = await signLegacy(payload, keys.legacyPrivateKeyPkcs8B64)
    if (tamper) {
      const [body, sig] = token.split('.')
      const forged = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(body.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))))
      forged.email = `tampered-${forged.email}`
      token = `${b64url(new TextEncoder().encode(JSON.stringify(forged)))}.${sig}`
    }
    return { legacy_token: token, sha256: await sha256Hex(token), payload }
  }),
)

server.registerTool(
  'claim_legacy',
  {
    description: 'POST /claim-legacy as a test user: redeem a legacy token as proof of purchase.',
    inputSchema: {
      user_email: z.string().describe('A user from create_test_user'),
      legacy_token: z.string(),
    },
  },
  tool(async ({ user_email, legacy_token }: { user_email: string; legacy_token: string }) => {
    const user = getUser(user_email)
    const res = await callFn('claim-legacy', { accessToken: user.accessToken, body: { legacy_token } })
    if (res.status === 200) {
      // Track the row for cleanup.
      const adm = await admin()
      const { data } = await adm.from('licenses').select('id').eq('legacy_token_hash', await sha256Hex(legacy_token.trim())).maybeSingle()
      if (data) seededLicenseIds.add(data.id)
    }
    return res
  }),
)

server.registerTool(
  'request_entitlement',
  {
    description:
      'POST /entitlement as a test user. The fingerprint is stable per (user, device_name), so repeating a call simulates the same device re-requesting; a new device_name simulates a new device. Verifies the returned JWT when test keys are present.',
    inputSchema: {
      user_email: z.string().describe('A user from create_test_user'),
      device_name: z.string().optional().describe("Default 'MCP-Test-PC'"),
      platform: z.enum(['windows', 'macos', 'linux']).optional(),
      app_version: z.string().optional(),
      fingerprint: z.string().optional().describe('Override the stable per-device fingerprint (64 hex chars)'),
    },
  },
  tool(async ({ user_email, device_name, platform, app_version, fingerprint }: {
    user_email: string
    device_name?: string
    platform?: 'windows' | 'macos' | 'linux'
    app_version?: string
    fingerprint?: string
  }) => {
    const user = getUser(user_email)
    const name = device_name ?? 'MCP-Test-PC'
    const fpKey = `${user.email}|${name}`
    const fp = fingerprint ?? fingerprints.get(fpKey) ?? randomFingerprint()
    fingerprints.set(fpKey, fp)

    const res = await callFn('entitlement', {
      accessToken: user.accessToken,
      body: { fingerprint: fp, device_name: name, platform: platform ?? 'linux', app_version: app_version ?? '1.4.0' },
    })

    const out: Record<string, unknown> = { status: res.status, body: res.body, fingerprint: fp }
    const token = (res.body as { token?: string } | null)?.token
    if (token) {
      try {
        const keys = await loadTestKeys()
        const publicKey = await importJWK(keys.entitlementPublicJwk, 'EdDSA')
        const { payload, protectedHeader } = await jwtVerify(token, publicKey, {
          issuer: ENTITLEMENT_ISSUER,
          audience: ENTITLEMENT_AUDIENCE,
        })
        out.jwt = { verified: true, header: protectedHeader, claims: payload }
      } catch (err) {
        out.jwt = {
          verified: false,
          reason: err instanceof Error ? err.message : String(err),
          claims_unverified: decodeJwt(token),
        }
      }
    }
    return out
  }),
)

server.registerTool(
  'list_devices',
  {
    description: 'GET /devices as a test user: their devices, revoked ones included.',
    inputSchema: { user_email: z.string() },
  },
  tool(async ({ user_email }: { user_email: string }) => {
    const user = getUser(user_email)
    return await callFn('devices', { method: 'GET', accessToken: user.accessToken })
  }),
)

server.registerTool(
  'deactivate_device',
  {
    description: 'POST /devices/deactivate as a test user: frees an activation slot (idempotent; 404 for devices that are not theirs).',
    inputSchema: { user_email: z.string(), device_id: z.string() },
  },
  tool(async ({ user_email, device_id }: { user_email: string; device_id: string }) => {
    const user = getUser(user_email)
    return await callFn('devices/deactivate', { accessToken: user.accessToken, body: { device_id } })
  }),
)

server.registerTool(
  'db_rows',
  {
    description:
      'Read license tables with the service role (bypasses RLS) to assert what the endpoints actually wrote.',
    inputSchema: {
      table: z.enum(['licenses', 'devices', 'webhook_events', 'trials']),
      buyer_email: z.string().optional().describe('licenses only: filter by buyer_email'),
      order_id: z.string().optional().describe('licenses only: filter by provider order/transaction id'),
      user_email: z.string().optional().describe('licenses/devices/trials: filter by a test user’s id'),
      limit: z.number().optional().describe('Default 20'),
    },
  },
  tool(async ({ table, buyer_email, order_id, user_email, limit }: {
    table: 'licenses' | 'devices' | 'webhook_events' | 'trials'
    buyer_email?: string
    order_id?: string
    user_email?: string
    limit?: number
  }) => {
    const adm = await admin()
    const orderCol = table === 'webhook_events' ? 'received_at' : table === 'trials' ? 'started_at' : 'created_at'
    let query = adm.from(table).select('*').order(orderCol, { ascending: false }).limit(limit ?? 20)
    if (buyer_email && table === 'licenses') query = query.eq('buyer_email', buyer_email.toLowerCase().trim())
    if (order_id && table === 'licenses') query = query.eq('order_id', order_id)
    if (user_email && table !== 'webhook_events') query = query.eq('user_id', getUser(user_email).id)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return data
  }),
)

server.registerTool(
  'seed_trial',
  {
    description:
      'Insert a trials row for a test user (Phase 1.5). days_in positions the trial in its 14-day life: 13 = one day left (token exp gets capped), 15+ = expired (403 trial_expired). Reuse a fingerprint from another user to test trial_unavailable.',
    inputSchema: {
      user_email: z.string().describe('A user from create_test_user'),
      days_in: z.number().optional().describe('How many days ago the trial started; default 0'),
      fingerprint: z.string().optional().describe('starting_fingerprint; default random'),
    },
  },
  tool(async ({ user_email, days_in, fingerprint }: {
    user_email: string
    days_in?: number
    fingerprint?: string
  }) => {
    const adm = await admin()
    const user = getUser(user_email)
    const day = 24 * 60 * 60 * 1000
    const startedAt = new Date(Date.now() - (days_in ?? 0) * day)
    const row = {
      user_id: user.id,
      started_at: startedAt.toISOString(),
      ends_at: new Date(startedAt.getTime() + 14 * day).toISOString(),
      starting_fingerprint: fingerprint ?? randomFingerprint(),
    }
    const { data, error } = await adm.from('trials').insert(row).select('*').single()
    if (error) throw new Error(`insert failed: ${error.message}`)
    return data // cleanup: cascades when cleanup_test_data deletes the user
  }),
)

server.registerTool(
  'set_license_status',
  {
    description:
      'Update a license row’s status with the service role — simulates what the Phase 2 refund/revoke webhook will do. Filter by license_id or buyer_email.',
    inputSchema: {
      status: z.enum(['active', 'refunded', 'revoked']),
      license_id: z.string().optional(),
      buyer_email: z.string().optional(),
    },
  },
  tool(async ({ status, license_id, buyer_email }: {
    status: 'active' | 'refunded' | 'revoked'
    license_id?: string
    buyer_email?: string
  }) => {
    if (!license_id && !buyer_email) throw new Error('Pass license_id or buyer_email')
    const adm = await admin()
    const update = adm.from('licenses').update({ status })
    const filtered = license_id ? update.eq('id', license_id) : update.eq('buyer_email', buyer_email!.toLowerCase().trim())
    const { data, error } = await filtered.select('*')
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) throw new Error('No matching license row')
    for (const row of data) seededLicenseIds.add(row.id)
    return data
  }),
)

server.registerTool(
  'warp_trial',
  {
    description:
      'Reposition a user’s EXISTING trial in time (service role): days_in=13 → one day left (token exp gets capped at ends_at), days_in=15 → expired (403 trial_expired). Start trials the real way, via request_entitlement.',
    inputSchema: {
      user_email: z.string().describe('A user from create_test_user'),
      days_in: z.number().describe('How many days ago the trial started'),
    },
  },
  tool(async ({ user_email, days_in }: { user_email: string; days_in: number }) => {
    const adm = await admin()
    const user = getUser(user_email)
    const day = 24 * 60 * 60 * 1000
    const startedAt = new Date(Date.now() - days_in * day)
    const { data, error } = await adm
      .from('trials')
      .update({
        started_at: startedAt.toISOString(),
        ends_at: new Date(startedAt.getTime() + 14 * day).toISOString(),
      })
      .eq('user_id', user.id)
      .select('*')
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) throw new Error('No trial row for that user — call request_entitlement first')
    return data[0]
  }),
)

async function signPaddle(secret: string, body: string): Promise<string> {
  const ts = Math.floor(Date.now() / 1000)
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}:${body}`))
  const h1 = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('')
  return `ts=${ts};h1=${h1}`
}

server.registerTool(
  'send_paddle_webhook',
  {
    description:
      'Simulate a Paddle webhook delivery, signed with PADDLE_WEBHOOK_SECRET from supabase/functions/.env.test (ts/h1 HMAC like Paddle sends) and POSTed to /webhooks-paddle. event_type "purchase" is a convenience that sends customer.created (with the email) followed by transaction.completed — the normal Paddle sequence. Use corrupt_signature or raw_body for rejection paths.',
    inputSchema: {
      event_type: z.enum(['purchase', 'transaction.completed', 'customer.created', 'refund', 'refund_pending', 'other'])
        .describe("'purchase' = customer.created + transaction.completed; 'refund' = approved adjustment; 'other' = an unrelated stored-only event"),
      transaction_id: z.string().optional().describe('txn id — idempotency scope for purchases/refunds'),
      customer_id: z.string().optional().describe('ctm id; default derived from transaction_id'),
      email: z.string().optional().describe('Buyer email (goes into customer.created)'),
      corrupt_signature: z.boolean().optional().describe('Send a wrong signature — must yield 401'),
      raw_body: z.string().optional().describe('Send this exact body instead of a built payload (still correctly signed unless corrupt_signature)'),
    },
  },
  tool(async ({ event_type, transaction_id, customer_id, email, corrupt_signature, raw_body }: {
    event_type: 'purchase' | 'transaction.completed' | 'customer.created' | 'refund' | 'refund_pending' | 'other'
    transaction_id?: string
    customer_id?: string
    email?: string
    corrupt_signature?: boolean
    raw_body?: string
  }) => {
    const cfg = await resolveConfig()
    const envText = await Deno.readTextFile(new URL('../functions/.env.test', import.meta.url))
    const secret = envText.match(/^PADDLE_WEBHOOK_SECRET=(.+)$/m)?.[1]?.trim()
    if (!secret) throw new Error('PADDLE_WEBHOOK_SECRET missing from supabase/functions/.env.test — run setup_test_keys')

    const txn = transaction_id ?? `txn_mcp_${crypto.randomUUID().slice(0, 8)}`
    const ctm = customer_id ?? `ctm_for_${txn}`

    const bodies: string[] = []
    if (raw_body !== undefined) {
      bodies.push(raw_body)
    } else {
      const evt = () => `evt_${crypto.randomUUID()}`
      if (event_type === 'purchase' || event_type === 'customer.created') {
        bodies.push(JSON.stringify({
          event_id: evt(),
          event_type: 'customer.created',
          occurred_at: new Date().toISOString(),
          data: { id: ctm, email: email ?? 'buyer@example.test', status: 'active' },
        }))
      }
      if (event_type === 'purchase' || event_type === 'transaction.completed') {
        bodies.push(JSON.stringify({
          event_id: evt(),
          event_type: 'transaction.completed',
          occurred_at: new Date().toISOString(),
          data: { id: txn, status: 'completed', customer_id: ctm, currency_code: 'USD' },
        }))
      }
      if (event_type === 'refund' || event_type === 'refund_pending') {
        bodies.push(JSON.stringify({
          event_id: evt(),
          event_type: 'adjustment.updated',
          occurred_at: new Date().toISOString(),
          data: {
            id: `adj_${crypto.randomUUID().slice(0, 8)}`,
            action: 'refund',
            status: event_type === 'refund' ? 'approved' : 'pending_approval',
            transaction_id: txn,
          },
        }))
      }
      if (event_type === 'other') {
        bodies.push(JSON.stringify({
          event_id: evt(),
          event_type: 'subscription.activated',
          data: { id: `sub_${crypto.randomUUID().slice(0, 8)}` },
        }))
      }
    }

    const results = []
    for (const body of bodies) {
      let signature = await signPaddle(secret, body)
      if (corrupt_signature) signature = signature.replace(/h1=..../, 'h1=0000')
      const res = await fetch(`${cfg.url}/functions/v1/webhooks-paddle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Paddle-Signature': signature },
        body,
      })
      const text = await res.text()
      if (res.status === 200) {
        paddleTxnIds.add(txn)
        try {
          paddleEventIds.add(JSON.parse(body).event_id)
        } catch { /* raw_body may not be JSON */ }
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = { raw: text }
      }
      results.push({ status: res.status, body: parsed })
    }
    return { transaction_id: txn, customer_id: ctm, deliveries: results }
  }),
)

server.registerTool(
  'cleanup_test_data',
  {
    description:
      'Delete everything this session created: seeded/claimed license rows and test users (their devices cascade). Also removes any license rows still attached to those users.',
    inputSchema: {},
  },
  tool(async () => {
    const adm = await admin()
    const userIds = [...users.values()].map((u) => u.id)

    let licensesDeleted = 0
    if (userIds.length > 0) {
      const { data } = await adm.from('licenses').delete().in('user_id', userIds).select('id')
      licensesDeleted += data?.length ?? 0
    }
    if (seededLicenseIds.size > 0) {
      const { data } = await adm.from('licenses').delete().in('id', [...seededLicenseIds]).select('id')
      licensesDeleted += data?.length ?? 0
    }
    if (paddleTxnIds.size > 0) {
      const { data } = await adm.from('licenses').delete().in('order_id', [...paddleTxnIds]).select('id')
      licensesDeleted += data?.length ?? 0
    }
    let eventsDeleted = 0
    if (paddleEventIds.size > 0) {
      const { data } = await adm.from('webhook_events').delete().in('event_id', [...paddleEventIds]).select('id')
      eventsDeleted = data?.length ?? 0
    }
    for (const id of userIds) await adm.auth.admin.deleteUser(id)

    const summary = { users_deleted: userIds.length, licenses_deleted: licensesDeleted, webhook_events_deleted: eventsDeleted }
    users.clear()
    seededLicenseIds.clear()
    fingerprints.clear()
    paddleTxnIds.clear()
    paddleEventIds.clear()
    return summary
  }),
)

await server.connect(new StdioServerTransport())
