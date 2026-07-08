import { readJson, writeJson } from './store'

// Append-only trail of admin activity (logins + every mutating admin action),
// shown on the admin page. Best-effort: a failed write never blocks the action
// it records. Capped so the file can't grow unbounded.

const KEY = 'site/audit.json'
const MAX_ENTRIES = 200

export interface AuditEntry {
  at: number
  action: string
  detail?: string
  ip?: string
}

export async function recordAudit(action: string, detail?: string, ip?: string): Promise<void> {
  try {
    const entries = await readJson<AuditEntry[]>(KEY, [])
    entries.push({ at: Date.now(), action, ...(detail ? { detail } : {}), ...(ip ? { ip } : {}) })
    await writeJson(KEY, entries.slice(-MAX_ENTRIES))
  } catch (err) {
    console.error('[audit] record failed:', (err as Error).message)
  }
}

export async function listAudit(limit = 50): Promise<AuditEntry[]> {
  const entries = await readJson<AuditEntry[]>(KEY, [])
  return entries.slice(-limit).reverse()
}
