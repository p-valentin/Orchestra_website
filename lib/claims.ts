import crypto from 'crypto'
import { deleteKey, listKeys, readJson, writeJson } from './store'

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

const PREFIX = 'site/claims/'
// Index of claimer emails, mirroring licenseGrants.ts: counting must not
// depend on an S3 list call, which needs a ListBucket-capable token that
// object read/write credentials may lack (it returned empty in production).
// Lives OUTSIDE the claims/ prefix so a list never counts it as a record.
// listKeys stays as a best-effort second source so records that predate the
// index still surface wherever listing does work.
const INDEX_KEY = 'site/claims-index.json'

function keyFor(email: string): string {
  const hash = crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex')
  return `${PREFIX}${hash}.json`
}

async function updateIndex(email: string): Promise<void> {
  const normalized = email.toLowerCase().trim()
  const index = await readJson<string[]>(INDEX_KEY, [])
  if (!index.includes(normalized)) await writeJson(INDEX_KEY, [...index, normalized])
}

// The claim count is derived from the records (index ∪ list), never kept as a
// separate counter — a counter needs read-modify-write and loses updates under
// concurrent serverless invocations (which is how the public count drifted).
// The union is computed on hashed keys, so it costs one read + one list.
export async function countClaims(): Promise<number> {
  const [index, keys] = await Promise.all([readJson<string[]>(INDEX_KEY, []), listKeys(PREFIX)])
  const all = new Set(keys)
  for (const email of index) all.add(keyFor(email))
  return all.size
}

export async function listClaims(): Promise<ClaimRecord[]> {
  const [index, keys] = await Promise.all([readJson<string[]>(INDEX_KEY, []), listKeys(PREFIX)])
  const all = new Set(keys)
  for (const email of index) all.add(keyFor(email))
  const records = await Promise.all([...all].map(key => readJson<ClaimRecord | null>(key, null)))
  return records
    .filter((r): r is ClaimRecord => r !== null)
    .sort((a, b) => b.issuedAt - a.issuedAt)
}

export async function getClaim(email: string): Promise<ClaimRecord | null> {
  return readJson<ClaimRecord | null>(keyFor(email), null)
}

// Removes a claim record and its index entry (test/junk sign-ups). The public
// count is derived, never stored, so it drops as soon as the record is gone.
export async function deleteClaim(email: string): Promise<void> {
  const normalized = email.toLowerCase().trim()
  await deleteKey(keyFor(email))
  const index = await readJson<string[]>(INDEX_KEY, [])
  if (index.includes(normalized)) await writeJson(INDEX_KEY, index.filter(e => e !== normalized))
}

// Idempotent: an existing claim is returned unchanged (same issuedAt ⇒ same
// token), so claiming twice never issues a second license or moves the date.
// Existing claims are (re-)indexed too, so a legacy claimer re-claiming
// backfills the index even though their record predates it.
export async function upsertClaim(email: string, plan: string, source: string): Promise<{ record: ClaimRecord; created: boolean }> {
  const existing = await getClaim(email)
  if (existing) {
    await updateIndex(email)
    return { record: existing, created: false }
  }
  const record: ClaimRecord = { email, plan, issuedAt: Date.now(), source }
  await writeJson(keyFor(email), record)
  await updateIndex(email)
  return { record, created: true }
}
