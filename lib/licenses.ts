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
}

export async function getLicenseStatus(): Promise<LicenseStatus> {
  const data = await readJson<LicensesFile>(KEY, { claimed: 0 })
  const claimed = Math.min(Math.max(data.claimed, 0), TOTAL_LICENSES)
  return { total: TOTAL_LICENSES, claimed, remaining: TOTAL_LICENSES - claimed }
}

export async function decrementLicense(): Promise<void> {
  const data = await readJson<LicensesFile>(KEY, { claimed: 0 })
  data.claimed = Math.min(Math.max(data.claimed, 0) + 1, TOTAL_LICENSES)
  await writeJson(KEY, data)
}
