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

// A conversation with one person. Carries no message text on purpose — the
// list view is a casually-read surface, and a preview would put customer
// correspondence back onto it. Bodies arrive only from getThread().
export interface MailThreadRow {
  id: string
  participant_email: string
  subject: string
  last_message_at: string
  created_at: string
  message_count: number
  unread_count: number
  last_direction: 'inbound' | 'outbound'
}

export interface MailMessageRow {
  id: string
  direction: 'inbound' | 'outbound'
  from_email: string
  // The From: header as received — free text a stranger wrote, and frequently
  // containing an address, so the function withholds it unless unmasked.
  from_header: string | null
  to_email: string
  subject: string
  body_text: string
  truncated: boolean
  attachments: { name: string; size: number; type: string }[]
  // The receiving MTA's SPF/DKIM/DMARC verdict. Evidence for the reader, never
  // something this code branches on.
  auth_results: string | null
  read_at: string | null
  created_at: string
  sent_email_id: string | null
}

// One open conversation. `reply_subject` is computed by the Edge Function so
// that subject normalisation has exactly one implementation — a second copy
// here would, the day the two disagreed, start a new thread instead of
// continuing this one.
export interface MailThreadDetail {
  id: string
  participant_email: string
  subject: string
  reply_subject: string
  last_message_at: string
  created_at: string
}

export interface MailThread {
  thread: MailThreadDetail
  rows: MailMessageRow[]
}

// The admin overview, in one shape. Counts only — this is the one payload from
// the Edge Function that carries nothing identifying, which is why it needs no
// masking and no reveal path.
export interface AdminMetrics {
  accounts: { total: number; confirmed: number; new_24h: number; new_7d: number; new_30d: number }
  trials: {
    total: number
    running: number
    started_7d: number
    started_30d: number
    expired_unconverted: number
  }
  // `paid` counts real provider orders; `granted` counts beta and legacy
  // licences. Keeping them apart is the difference between "18 customers" and
  // the truth. See migration 0011.
  licenses: {
    paid: number
    granted: number
    refunded: number
    revoked: number
    unattached: number
    paid_30d: number
  }
  active: { dau: number; wau: number; mau: number; devices_total: number; devices_dau: number }
  platforms: Record<string, number>
  versions: Record<string, number>
  /** Empty until the entitlement function has been writing check-ins for a day. */
  dau_series: { day: string; active: number }[]
  support: { threads: number; unread: number; sent_30d: number; send_failures_30d: number }
  refunds: { total: number; submitted: number; refunded: number; failed: number }
  generated_at: string
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

// Signs and sends one request. Returns the parsed response, or null for
// anything that did not work — the function 404s every failure by design, so
// there is nothing more specific to hand back.
async function call(payload: Record<string, unknown>): Promise<Record<string, unknown> | null> {
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

  const body = JSON.stringify(payload)
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
      // 404s everything, so status alone cannot tell us whether the signature
      // was wrong or the view was — log and move on.
      console.error(`[admin-data] ${payload.view} request rejected (${res.status})`)
      return null
    }
    return (await res.json()) as Record<string, unknown>
  } catch (err) {
    console.error(`[admin-data] ${payload.view} request failed:`, err instanceof Error ? err.message : err)
    return null
  }
}

async function query<T>(view: string, limit: number, reveal: boolean): Promise<T[] | null> {
  const json = await call({ view, limit, reveal })
  return Array.isArray(json?.rows) ? (json.rows as T[]) : null
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

// Everything the overview needs, in a single signed round-trip. Returns null on
// any failure, which the page renders as em-dashes rather than an error state —
// the dashboard being partly unavailable should not hide the parts that work.
export async function getAdminMetrics(): Promise<AdminMetrics | null> {
  const json = await call({ view: 'metrics' })
  return (json?.metrics as AdminMetrics | undefined) ?? null
}

// ---------- the inbox ----------

export async function listMailThreads(limit = 50, reveal = false): Promise<MailThreadRow[] | null> {
  return await query<MailThreadRow>('threads', limit, reveal)
}

// The unread badge. Its own call because it is made on EVERY admin page load,
// whichever tab is open, and "are there unread messages" has no business
// dragging addresses or bodies across the wire to answer it. Returns 0 rather
// than null on failure: a badge is not worth an error state.
export async function unreadMailCount(): Promise<number> {
  const json = await call({ view: 'mail-unread' })
  return typeof json?.unread === 'number' ? json.unread : 0
}

// `reveal` is the deliberate act. The page renders masked; the REPLY path asks
// for the real address server-side, so answering somebody never requires their
// address to be rendered in a browser first.
export async function getMailThread(id: string, reveal = false): Promise<MailThread | null> {
  const json = await call({ view: 'thread', id, reveal })
  if (!json?.thread || !Array.isArray(json.rows)) return null
  return { thread: json.thread as MailThreadDetail, rows: json.rows as MailMessageRow[] }
}

export async function markThreadRead(id: string): Promise<boolean> {
  const json = await call({ view: 'thread-read', id })
  return json?.ok === true
}

// Records a send in the log — and, when it carries a body and actually went
// out, files it into the conversation. One call, so "we sent something" has one
// write path however it was triggered.
export async function recordSentEmail(record: {
  to_email: string
  subject: string
  status: 'sent' | 'failed'
  provider_id?: string | null
  error?: string | null
  source?: string
  body?: string
  thread_id?: string | null
}): Promise<boolean> {
  const json = await call({ view: 'record-email', record })
  return json?.ok === true
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
