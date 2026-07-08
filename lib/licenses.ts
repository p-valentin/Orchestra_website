import { readJson, writeJson } from './store'
import { countClaims } from './claims'

const KEY = 'site/licenses.json'

export const TOTAL_LICENSES = 50

// The claimed count is DERIVED: per-email records under site/claims/ (one
// object per claimer, written by lib/claims.ts) plus a legacy offset for
// claims made before those records existed (pre Jul 2026). The old shared
// counter in this file lost updates under concurrent claims — its stale
// `claimed` field is ignored on read and dropped on the next write.
interface LicensesFile {
  legacyClaims?: number
}

export interface LicenseStatus {
  total: number
  claimed: number
  remaining: number
  legacyClaims: number // claims from before per-email records; admin-adjustable
  recordedClaims: number // per-email claim records actually on file
  cutoff: number | null // epoch ms the free window closes, or null if no time limit
  closed: boolean // true once the count is exhausted OR the cutoff has passed
}

// Free window closes at the earlier of TOTAL_LICENSES claims or CLAIM_CUTOFF.
// CLAIM_CUTOFF is an ISO-8601 date in env; unset means count-limited only, so a
// missing/invalid value never slams the window shut by accident.
function cutoffMs(): number | null {
  const raw = process.env.CLAIM_CUTOFF
  if (!raw) return null
  const t = Date.parse(raw)
  return Number.isNaN(t) ? null : t
}

export async function getLicenseStatus(): Promise<LicenseStatus> {
  const [data, recordedClaims] = await Promise.all([
    readJson<LicensesFile>(KEY, {}),
    countClaims(),
  ])
  const legacyClaims = Math.max(0, Math.floor(data.legacyClaims ?? 0))
  const claimed = Math.min(legacyClaims + recordedClaims, TOTAL_LICENSES)
  const remaining = TOTAL_LICENSES - claimed
  const cutoff = cutoffMs()
  const closed = remaining <= 0 || (cutoff !== null && Date.now() > cutoff)
  return { total: TOTAL_LICENSES, claimed, remaining, legacyClaims, recordedClaims, cutoff, closed }
}

// Reconcile control for the admin page: how many people claimed before
// per-email records existed. If one of them re-claims in the app they gain a
// record, so this should be decremented then.
export async function setLegacyClaims(count: number): Promise<boolean> {
  const legacyClaims = Math.min(Math.max(Math.floor(count), 0), TOTAL_LICENSES)
  return writeJson(KEY, { legacyClaims })
}
