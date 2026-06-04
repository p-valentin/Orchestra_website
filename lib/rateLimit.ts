type RequestLog = number[] // timestamps in ms

const WINDOW_MS = 60 * 60 * 1000 // 1 hour
const MAX_HITS = 3

const buckets = new Map<string, RequestLog>()

let lastSweep = 0
function sweep(now: number): void {
  if (now - lastSweep < WINDOW_MS) return
  lastSweep = now
  for (const [key, hits] of buckets) {
    const fresh = hits.filter((t) => now - t < WINDOW_MS)
    if (fresh.length === 0) buckets.delete(key)
    else buckets.set(key, fresh)
  }
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterMs: number
}

export function rateLimit(key: string): RateLimitResult {
  const now = Date.now()
  sweep(now)

  const hits = (buckets.get(key) ?? []).filter((t) => now - t < WINDOW_MS)

  if (hits.length >= MAX_HITS) {
    const oldest = hits[0] ?? now
    return { allowed: false, remaining: 0, retryAfterMs: WINDOW_MS - (now - oldest) }
  }

  hits.push(now)
  buckets.set(key, hits)
  return { allowed: true, remaining: MAX_HITS - hits.length, retryAfterMs: 0 }
}
