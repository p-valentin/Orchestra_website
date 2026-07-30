// Unique visitors, read from Vercel Web Analytics.
//
// The first-party counter in lib/stats.ts is deliberately identifier-free — it
// increments a count per (day, path, country) and stores nothing that could
// distinguish one person from another. That is a feature, and it is also why it
// can never answer "how many PEOPLE", only "how many pageviews". Asking it to
// would mean introducing a visitor identifier, which would contradict both the
// privacy policy and the note rendered on the admin page itself.
//
// Vercel Web Analytics already runs on this site (<Analytics /> in the root
// layout) and already does the de-duplication server-side. app/privacy already
// discloses it: "Vercel, our hosting provider, additionally reports aggregate,
// anonymized traffic." So reading it adds no tracking, needs no consent change,
// and is simply using data we already collect.
//
// Requires VERCEL_ANALYTICS_TOKEN (a read-scoped Vercel API token). Without it
// every function here returns null and the page renders em-dashes — the
// dashboard degrades rather than breaks, the same way adminDataConfigured does.

import { unstable_cache } from 'next/cache'

const API = 'https://vercel.com/api/web-analytics'

// Ten minutes. This is trend data on a page that auto-refreshes; re-querying a
// third-party API every time the poller ticks would be rude to them and slow
// for us, and nobody is making a decision on the last six minutes of traffic.
const CACHE_SECONDS = 600

export interface VisitorTotals {
  visitors: number
  pageviews: number
}

export interface ReferrerRow {
  host: string
  visitors: number
}

export function analyticsConfigured(): boolean {
  return Boolean(process.env.VERCEL_ANALYTICS_TOKEN && projectId())
}

function projectId(): string | undefined {
  return process.env.VERCEL_PROJECT_ID || process.env.NEXT_PUBLIC_VERCEL_PROJECT_ID
}

function teamId(): string | undefined {
  return process.env.VERCEL_TEAM_ID
}

async function get(path: string, params: Record<string, string>): Promise<unknown | null> {
  const token = process.env.VERCEL_ANALYTICS_TOKEN
  const project = projectId()
  if (!token || !project) return null

  const query = new URLSearchParams({ ...params, projectId: project })
  const team = teamId()
  if (team) query.set('teamId', team)

  try {
    const res = await fetch(`${API}${path}?${query}`, {
      headers: { Authorization: `Bearer ${token}` },
      // Short: the admin page must never sit waiting on somebody else's API.
      signal: AbortSignal.timeout(6_000),
      cache: 'no-store',
    })
    if (!res.ok) {
      console.error(`[analytics] ${path} rejected (${res.status})`)
      return null
    }
    return await res.json()
  } catch (err) {
    console.error(`[analytics] ${path} failed:`, err instanceof Error ? err.message : err)
    return null
  }
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

async function fetchTotals(days: number): Promise<VisitorTotals | null> {
  const json = (await get('/count', {
    since: isoDaysAgo(days),
    until: new Date().toISOString(),
  })) as { data?: { visitors?: number; pageviews?: number } } | null
  const data = json?.data
  if (!data || typeof data.visitors !== 'number') return null
  return { visitors: data.visitors, pageviews: data.pageviews ?? 0 }
}

async function fetchReferrers(days: number, limit: number): Promise<ReferrerRow[] | null> {
  const json = (await get('/aggregate', {
    since: isoDaysAgo(days),
    until: new Date().toISOString(),
    by: 'referrerHostname',
    limit: String(limit),
  })) as { data?: { referrerHostname?: string; visitors?: number }[] } | null
  if (!Array.isArray(json?.data)) return null
  return json.data
    .map(row => ({ host: row.referrerHostname || 'direct', visitors: row.visitors ?? 0 }))
    .filter(row => row.visitors > 0)
}

// unstable_cache keys on the argument list, so each window is cached separately
// and the admin page's four tiles cost at most four upstream calls per ten
// minutes however often the page re-renders.
export const visitorTotals = unstable_cache(
  async (days: number) => await fetchTotals(days),
  ['vercel-visitor-totals'],
  { revalidate: CACHE_SECONDS, tags: ['vercel-analytics'] },
)

export const topReferrers = unstable_cache(
  async (days: number, limit: number) => await fetchReferrers(days, limit),
  ['vercel-referrers'],
  { revalidate: CACHE_SECONDS, tags: ['vercel-analytics'] },
)
