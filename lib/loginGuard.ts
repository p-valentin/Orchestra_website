import { readJson, writeJson } from './store'

// Brute-force lockout, persisted in the data store so it holds across
// serverless instances: 8 failed attempts in 15 minutes locks the login.
// Node runtime only — never import from middleware.

const KEY = 'site/auth.json'
const MAX_FAILURES = 8
const WINDOW_MS = 15 * 60_000
const FAILURE_DELAY_MS = 600

interface AuthFile {
  failures: number[]
}

export async function lockedOut(): Promise<boolean> {
  const data = await readJson<AuthFile>(KEY, { failures: [] })
  const cutoff = Date.now() - WINDOW_MS
  return data.failures.filter(t => t > cutoff).length >= MAX_FAILURES
}

export async function recordFailure(): Promise<void> {
  const data = await readJson<AuthFile>(KEY, { failures: [] })
  const cutoff = Date.now() - WINDOW_MS
  data.failures = [...data.failures.filter(t => t > cutoff), Date.now()].slice(-MAX_FAILURES * 2)
  await writeJson(KEY, data)
  await new Promise(r => setTimeout(r, FAILURE_DELAY_MS))
}

export async function clearFailures(): Promise<void> {
  await writeJson(KEY, { failures: [] })
}
