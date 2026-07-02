import { readJson, writeJson } from './store'

const KEY = 'site/licenses.json'

export const TOTAL_LICENSES = 50

interface LicensesFile {
  claimed: number
}

export interface LicenseStatus {
  total: number
  claimed: number
  remaining: number
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
  const data = await readJson<LicensesFile>(KEY, { claimed: 0 })
  const claimed = Math.min(Math.max(data.claimed, 0), TOTAL_LICENSES)
  const remaining = TOTAL_LICENSES - claimed
  const cutoff = cutoffMs()
  const closed = remaining <= 0 || (cutoff !== null && Date.now() > cutoff)
  return { total: TOTAL_LICENSES, claimed, remaining, cutoff, closed }
}

export async function decrementLicense(): Promise<void> {
  const data = await readJson<LicensesFile>(KEY, { claimed: 0 })
  data.claimed = Math.min(Math.max(data.claimed, 0) + 1, TOTAL_LICENSES)
  await writeJson(KEY, data)
}
