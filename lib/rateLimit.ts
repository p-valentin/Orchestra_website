type RequestLog = number[] // timestamps in ms

const WINDOW_MS = 60 * 60 * 1000 // 1 hour
const MAX_HITS = 3

const buckets = new Map<string, RequestLog>()

// Sweeping must not drop entries still inside some caller's window, so it
// tracks the largest window any caller has used.
let maxWindowMs = WINDOW_MS

let lastSweep = 0
function sweep(now: number): void {
  if (now - lastSweep < maxWindowMs) return
  lastSweep = now
  for (const [key, hits] of buckets) {
    const fresh = hits.filter((t) => now - t < maxWindowMs)
    if (fresh.length === 0) buckets.delete(key)
    else buckets.set(key, fresh)
  }
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterMs: number
}

export interface RateLimitOptions {
  max?: number // default 3
  windowMs?: number // default 1 hour
}

export function rateLimit(key: string, opts: RateLimitOptions = {}): RateLimitResult {
  const max = opts.max ?? MAX_HITS
  const windowMs = opts.windowMs ?? WINDOW_MS
  if (windowMs > maxWindowMs) maxWindowMs = windowMs
  const now = Date.now()
  sweep(now)

  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)

  if (hits.length >= max) {
    const oldest = hits[0] ?? now
    return { allowed: false, remaining: 0, retryAfterMs: windowMs - (now - oldest) }
  }

  hits.push(now)
  buckets.set(key, hits)
  return { allowed: true, remaining: max - hits.length, retryAfterMs: 0 }
}
