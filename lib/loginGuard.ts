import { readJson, writeJson } from './store'

// Brute-force lockout, persisted in the data store so it holds across
// serverless instances. Failures are tracked PER IP (8 in 15 minutes locks
// that IP) with a global backstop (40 across all IPs) — per-IP alone would
// let a botnet rotate addresses, while the old global-only counter let any
// stranger lock the owner out with 8 junk passwords.
// Node runtime only — never import from middleware.

const KEY = 'site/auth.json'
const MAX_FAILURES_PER_IP = 8
const MAX_FAILURES_GLOBAL = 40
const WINDOW_MS = 15 * 60_000
const FAILURE_DELAY_MS = 600
const MAX_TRACKED_IPS = 200

interface AuthFile {
  // ip → failure timestamps. Older deployments stored { failures: number[] };
  // that shape reads as having no per-IP entries and ages out naturally.
  byIp?: Record<string, number[]>
}

function fresh(times: number[] | undefined, cutoff: number): number[] {
  return (times ?? []).filter(t => t > cutoff)
}

export async function lockedOut(ip: string): Promise<boolean> {
  const data = await readJson<AuthFile>(KEY, {})
  const cutoff = Date.now() - WINDOW_MS
  const byIp = data.byIp ?? {}
  if (fresh(byIp[ip], cutoff).length >= MAX_FAILURES_PER_IP) return true
  const total = Object.values(byIp).reduce((sum, times) => sum + fresh(times, cutoff).length, 0)
  return total >= MAX_FAILURES_GLOBAL
}

export async function recordFailure(ip: string): Promise<void> {
  const data = await readJson<AuthFile>(KEY, {})
  const cutoff = Date.now() - WINDOW_MS
  const byIp: Record<string, number[]> = {}
  for (const [addr, times] of Object.entries(data.byIp ?? {})) {
    const kept = fresh(times, cutoff)
    if (kept.length > 0) byIp[addr] = kept
  }
  byIp[ip] = [...fresh(byIp[ip], cutoff), Date.now()].slice(-MAX_FAILURES_PER_IP * 2)
  // Bound the file: a spray across many IPs can't grow it without limit.
  const addrs = Object.keys(byIp)
  if (addrs.length > MAX_TRACKED_IPS) {
    for (const addr of addrs.slice(0, addrs.length - MAX_TRACKED_IPS)) delete byIp[addr]
  }
  await writeJson(KEY, { byIp })
  await new Promise(r => setTimeout(r, FAILURE_DELAY_MS))
}

export async function clearFailures(ip: string): Promise<void> {
  const data = await readJson<AuthFile>(KEY, {})
  const byIp = { ...(data.byIp ?? {}) }
  delete byIp[ip]
  await writeJson(KEY, { byIp })
}
