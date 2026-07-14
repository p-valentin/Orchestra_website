// Shared helpers for the Phase 1 test suite.
//
// Unit tests (tests/unit/) need only Deno. Integration tests (tests/integration/)
// need a running local stack:
//   supabase start
//   deno run -A scripts/setup-test-env.ts
//   supabase functions serve --env-file supabase/functions/.env.test
//   deno test -A supabase/tests
// See README-phase1.md.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { JWK } from 'npm:jose@5.9.6'

// ---------- environment ----------

function firstEnv(...names: string[]): string | undefined {
  for (const n of names) {
    const v = Deno.env.get(n)
    if (v) return v
  }
  return undefined
}

// `supabase status -o env` exports API_URL/ANON_KEY/SERVICE_ROLE_KEY; the
// SUPABASE_* names are what `functions serve` injects. Accept both.
export const SUPABASE_URL = firstEnv('SUPABASE_URL', 'API_URL') ?? 'http://127.0.0.1:54321'
export const ANON_KEY = firstEnv('SUPABASE_ANON_KEY', 'ANON_KEY') ?? ''
export const SERVICE_ROLE_KEY = firstEnv('SUPABASE_SERVICE_ROLE_KEY', 'SERVICE_ROLE_KEY') ?? ''

export function requireStack(): void {
  if (!ANON_KEY || !SERVICE_ROLE_KEY) {
    throw new Error(
      'Integration tests need SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY ' +
        '(or ANON_KEY / SERVICE_ROLE_KEY from `supabase status -o env`).',
    )
  }
}

// ---------- clients ----------

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
}

// A PostgREST client acting as the given signed-in user (for RLS tests).
export function userClient(accessToken: string): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

// ---------- users ----------

export interface TestUser {
  id: string
  email: string
  accessToken: string
}

const TEST_PASSWORD = 'phase1-test-password-123!'

// Creates a confirmed auth user and signs in to obtain a real access token.
export async function createTestUser(email: string): Promise<TestUser> {
  const admin = adminClient()
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  })
  if (createErr || !created.user) throw new Error(`createUser failed: ${createErr?.message}`)

  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
  const { data: session, error: signInErr } = await anon.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  })
  if (signInErr || !session.session) throw new Error(`signIn failed: ${signInErr?.message}`)
  return { id: created.user.id, email, accessToken: session.session.access_token }
}

export async function deleteTestUser(userId: string): Promise<void> {
  await adminClient().auth.admin.deleteUser(userId)
}

// Unique addresses so test runs never collide with leftovers.
export function uniqueEmail(tag: string): string {
  return `${tag}-${crypto.randomUUID().slice(0, 8)}@phase1.test`
}

// ---------- edge function calls ----------

export interface FnResponse {
  status: number
  // deno-lint-ignore no-explicit-any
  body: any
}

export async function callFn(
  path: string,
  opts: { method?: string; token?: string; body?: unknown } = {},
): Promise<FnResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
    method: opts.method ?? 'POST',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = { raw: text }
  }
  return { status: res.status, body }
}

// ---------- legacy tokens (mirrors the website's lib/token.ts exactly) ----------

export interface LegacyKeypair {
  privateKey: CryptoKey
  publicKey: CryptoKey
  publicSpkiPem: string
}

function toPem(der: ArrayBuffer, label: string): string {
  const b64 = btoa(String.fromCharCode(...new Uint8Array(der)))
  const lines = b64.match(/.{1,64}/g) ?? []
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`
}

export async function generateLegacyKeypair(): Promise<LegacyKeypair> {
  const pair = (await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as CryptoKeyPair
  const spki = await crypto.subtle.exportKey('spki', pair.publicKey)
  return { privateKey: pair.privateKey, publicKey: pair.publicKey, publicSpkiPem: toPem(spki, 'PUBLIC KEY') }
}

export async function importLegacyPrivateKeyPkcs8B64(b64: string): Promise<CryptoKey> {
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  return await crypto.subtle.importKey('pkcs8', der, 'Ed25519', false, ['sign'])
}

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Website format (lib/token.ts): base64url(payloadJson) + '.' + base64url(
// ed25519 signature over the UTF-8 bytes OF THE BASE64URL BODY STRING).
export async function signLegacyToken(
  payload: Record<string, unknown>,
  privateKey: CryptoKey,
): Promise<string> {
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)))
  const sig = await crypto.subtle.sign('Ed25519', privateKey, new TextEncoder().encode(body))
  return `${body}.${b64url(new Uint8Array(sig))}`
}

// The signing keys `supabase functions serve` was started with, written by
// scripts/setup-test-env.ts next to this file.
export interface TestKeys {
  legacyPrivateKeyPkcs8B64: string
  entitlementPublicJwk: JWK
}

export async function loadTestKeys(): Promise<TestKeys> {
  const path = new URL('./.keys.test.json', import.meta.url)
  try {
    return JSON.parse(await Deno.readTextFile(path)) as TestKeys
  } catch {
    throw new Error('Missing supabase/tests/.keys.test.json — run: deno run -A scripts/setup-test-env.ts')
  }
}

// ---------- seeding ----------

export interface SeedLicense {
  buyer_email: string
  user_id?: string | null
  status?: 'active' | 'refunded' | 'revoked'
  ls_order_id?: string
  legacy_token_hash?: string
  claimed_at?: string
}

// Inserts a license row via the service role. The schema requires an origin
// (ls_order_id or legacy_token_hash), so default to a unique fake order id.
export async function seedLicense(seed: SeedLicense): Promise<string> {
  const admin = adminClient()
  const row = {
    buyer_email: seed.buyer_email.toLowerCase().trim(),
    user_id: seed.user_id ?? null,
    status: seed.status ?? 'active',
    ls_order_id: seed.legacy_token_hash ? undefined : (seed.ls_order_id ?? `test-order-${crypto.randomUUID()}`),
    legacy_token_hash: seed.legacy_token_hash,
    claimed_at: seed.claimed_at ?? (seed.user_id ? new Date().toISOString() : undefined),
  }
  const { data, error } = await admin.from('licenses').insert(row).select('id').single()
  if (error) throw new Error(`seedLicense failed: ${error.message}`)
  return data.id as string
}

// ---------- misc ----------

export function randomFingerprint(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256HexOf(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
