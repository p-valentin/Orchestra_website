import crypto from 'crypto'
import { readJson, writeJson } from './store'

// One record per claimer, keyed by a hash of the email, so writes never collide
// (unlike the shared counter in licenses.ts). This is the authoritative record
// of who holds a license; the token itself isn't stored — it's re-derived by
// signing the same payload (see lib/token.ts), so reissue on reinstall is free.

export interface ClaimRecord {
  email: string
  plan: string
  issuedAt: number
  source: string
}

function keyFor(email: string): string {
  const hash = crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex')
  return `site/claims/${hash}.json`
}

export async function getClaim(email: string): Promise<ClaimRecord | null> {
  return readJson<ClaimRecord | null>(keyFor(email), null)
}

// Idempotent: an existing claim is returned unchanged (same issuedAt ⇒ same
// token), so claiming twice never issues a second license or moves the date.
export async function upsertClaim(email: string, plan: string, source: string): Promise<{ record: ClaimRecord; created: boolean }> {
  const existing = await getClaim(email)
  if (existing) return { record: existing, created: false }
  const record: ClaimRecord = { email, plan, issuedAt: Date.now(), source }
  await writeJson(keyFor(email), record)
  return { record, created: true }
}
