import crypto from 'crypto'
import { readJson, writeJson } from './store'

// Paid licenses, granted per email — this is the license database the app's
// server verification checks. Records are keyed by an email hash like
// claims.ts; a separate index file lists granted emails so the admin page can
// enumerate them without an S3 list call. The index is display-only — the
// per-email record is authoritative.

export interface GrantRecord {
  email: string
  plan: 'lifetime'
  status: 'active' | 'revoked'
  createdAt: number
  updatedAt: number
  source: string // 'admin' | 'purchase' | ...
  note?: string
}

const INDEX_KEY = 'site/licenses/index.json'

function keyFor(email: string): string {
  const hash = crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex')
  return `site/licenses/${hash}.json`
}

export async function getGrant(email: string): Promise<GrantRecord | null> {
  return readJson<GrantRecord | null>(keyFor(email), null)
}

async function updateIndex(email: string): Promise<void> {
  const normalized = email.toLowerCase().trim()
  const index = await readJson<string[]>(INDEX_KEY, [])
  if (!index.includes(normalized)) await writeJson(INDEX_KEY, [...index, normalized])
}

// Grant (or re-activate) a license. Idempotent on the active state; a revoked
// record flips back to active with a fresh updatedAt.
export async function grantLicense(email: string, source: string, note?: string): Promise<GrantRecord> {
  const normalized = email.toLowerCase().trim()
  const existing = await getGrant(normalized)
  const now = Date.now()
  const record: GrantRecord = existing
    ? { ...existing, status: 'active', updatedAt: now, source, ...(note ? { note } : {}) }
    : { email: normalized, plan: 'lifetime', status: 'active', createdAt: now, updatedAt: now, source, ...(note ? { note } : {}) }
  await writeJson(keyFor(normalized), record)
  await updateIndex(normalized)
  return record
}

export async function revokeLicense(email: string): Promise<GrantRecord | null> {
  const existing = await getGrant(email)
  if (!existing) return null
  const record: GrantRecord = { ...existing, status: 'revoked', updatedAt: Date.now() }
  await writeJson(keyFor(email), record)
  return record
}

export async function listGrants(): Promise<GrantRecord[]> {
  const index = await readJson<string[]>(INDEX_KEY, [])
  const records = await Promise.all(index.map((email) => getGrant(email)))
  return records
    .filter((r): r is GrantRecord => r !== null)
    .sort((a, b) => b.createdAt - a.createdAt)
}
