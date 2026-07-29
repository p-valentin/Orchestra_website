// Server-side client for the admin-data Edge Function.
//
// The website holds no Supabase service-role key — that invariant is in
// supabase/SECURITY-REVIEW.md and this module is why it survives contact with
// the admin page. Privileged reads happen inside Supabase; the site proves it
// is the site by SIGNING each request with ADMIN_DATA_SECRET, and the
// signature expires in 60 seconds.
//
// So a leaked request (a log line, a proxy dump, a captured header) is worth
// nothing a minute later, where a static bearer token would be worth
// everything forever.
//
// SERVER ONLY. ADMIN_DATA_SECRET has no NEXT_PUBLIC_ prefix and must never
// acquire one.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

const FUNCTION_PATH = '/functions/v1/admin-data'
// The signature covers only the last path segment — the gateway and the local
// runtime disagree about the prefix. See _shared/admin-auth.ts canonicalPath.
const SIGNED_PATH = '/admin-data'

export interface PurchaseRow {
  id: string
  order_id: string | null
  buyer_email: string | null
  status: string
  plan: string
  purchased_at: string
  claimed_at: string | null
  attached: boolean
}

export interface RefundRow {
  id: string
  order_id: string
  reason: string
  detail: string | null
  status: string
  failure_reason: string | null
  amount_cents: number | null
  currency: string | null
  created_at: string
  completed_at: string | null
}

// A sent message. No body: the log is read casually and should not become a
// second copy of everything ever written to a customer. provider_id is Resend's
// message id — the handle for asking them what happened to a specific one.
export interface SentEmailRow {
  id: string
  to_email: string
  subject: string
  status: 'sent' | 'failed'
  provider_id: string | null
  error: string | null
  source: string
  created_at: string
}

export const REASON_LABELS: Record<string, string> = {
  not_what_expected: 'Not what they expected',
  missing_feature: 'Missing a feature',
  too_difficult: 'Too difficult to use',
  bugs: 'Bugs / did not work',
  too_expensive: 'Too expensive',
  bought_by_mistake: 'Bought by mistake',
  other: 'Other',
}

export function adminDataConfigured(): boolean {
  const secret = process.env.ADMIN_DATA_SECRET
  return Boolean(secret && secret.length >= 32 && process.env.NEXT_PUBLIC_SUPABASE_URL)
}

async function query<T>(view: 'purchases' | 'refunds', limit: number, reveal: boolean): Promise<T[] | null> {
  const secret = process.env.ADMIN_DATA_SECRET
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!secret || !base) return null
  // Refuse to sign with a weak secret rather than sending a request that the
  // function will reject anyway — this fails loudly in the logs at deploy time
  // instead of looking like an outage later.
  if (secret.length < 32) {
    console.error('[admin-data] ADMIN_DATA_SECRET is too short (need ≥32 chars) — refusing to sign')
    return null
  }

  const body = JSON.stringify({ view, limit, reveal })
  const ts = Math.floor(Date.now() / 1000)
  const bodyHash = createHash('sha256').update(body).digest('hex')
  const sig = createHmac('sha256', secret)
    .update(`${ts}.POST.${SIGNED_PATH}.${bodyHash}`)
    .digest('base64')

  try {
    const res = await fetch(`${base}${FUNCTION_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-orchestra-ts': String(ts),
        'x-orchestra-sig': `v1,${sig}`,
      },
      body,
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    })
    if (!res.ok) {
      // The function 404s every failure by design, so status alone cannot tell
      // us whether the signature was wrong or the view was — log and move on.
      console.error(`[admin-data] ${view} request rejected (${res.status})`)
      return null
    }
    const json = await res.json()
    return Array.isArray(json?.rows) ? (json.rows as T[]) : null
  } catch (err) {
    console.error(`[admin-data] ${view} request failed:`, err instanceof Error ? err.message : err)
    return null
  }
}

// `reveal` un-masks buyer emails. The admin page leaves it false by default so
// that the common case — glancing at the page, screenshotting it, showing it to
// someone — exposes nothing that identifies a customer.
export async function listPurchases(limit = 50, reveal = false): Promise<PurchaseRow[] | null> {
  return await query<PurchaseRow>('purchases', limit, reveal)
}

export async function listRefundRequests(limit = 50): Promise<RefundRow[] | null> {
  return await query<RefundRow>('refunds', limit, false)
}

export async function listSentEmails(limit = 50, reveal = false): Promise<SentEmailRow[] | null> {
  return await query<SentEmailRow>('emails', limit, reveal)
}

// Used by the admin page to gate the reveal toggle behind a second factor of
// intent: revealing requires re-supplying the admin password, so a walked-away
// session cannot be used to harvest addresses.
export function verifyRevealPassword(given: string): boolean {
  const password = process.env.ADMIN_PASSWORD
  if (!password) return false
  const a = Buffer.from(given)
  const b = Buffer.from(password)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
