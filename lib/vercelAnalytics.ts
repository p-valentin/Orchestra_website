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
// Requires ANALYTICS_API_TOKEN (a read-scoped Vercel API token). Without it
// every function here returns null and the page renders em-dashes — the
// dashboard degrades rather than breaks, the same way adminDataConfigured does.

import { unstable_cache } from 'next/cache'

// The documented Web Analytics query API.
//
// Verified by probing: /visits/count and /visits/aggregate answer 403 and 400
// unauthenticated (real endpoints, rejecting the request), where a wrong path
// answers 404. Worth stating because the first version of this file called
// https://vercel.com/api/web-analytics/... which does not exist at all — it
// would have returned null for ever, and looked exactly like a bad token.
const API = 'https://api.vercel.com/v1/query/web-analytics'

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

// NOTE ON THE NAMES: none of these may begin with VERCEL_.
//
// Vercel reserves that prefix for its own system variables and refuses to
// create user variables using it, so the obvious name — VERCEL_ANALYTICS_TOKEN
// — cannot be added in the dashboard at all. Hence ANALYTICS_*.
//
// VERCEL_PROJECT_ID is the one exception, and only because we READ it rather
// than set it: Vercel injects it into every deployment automatically, so in
// production the project id needs no configuration. ANALYTICS_PROJECT_ID is the
// escape hatch for running this anywhere else.
export function analyticsConfigured(): boolean {
  return Boolean(token() && projectId())
}

function token(): string | undefined {
  return process.env.ANALYTICS_API_TOKEN
}

function projectId(): string | undefined {
  return process.env.ANALYTICS_PROJECT_ID || process.env.VERCEL_PROJECT_ID
}

function teamId(): string | undefined {
  return process.env.ANALYTICS_TEAM_ID
}

async function get(path: string, params: Record<string, string>): Promise<unknown | null> {
  const apiToken = token()
  const project = projectId()
  if (!apiToken || !project) return null

  const query = new URLSearchParams({ ...params, projectId: project })
  const team = teamId()
  if (team) query.set('teamId', team)

  try {
    const res = await fetch(`${API}${path}?${query}`, {
      headers: { Authorization: `Bearer ${apiToken}` },
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
  const json = (await get('/visits/count', {
    since: isoDaysAgo(days),
    until: new Date().toISOString(),
  })) as { data?: { visitors?: number; pageviews?: number } } | null
  const data = json?.data
  if (!data || typeof data.visitors !== 'number') return null
  return { visitors: data.visitors, pageviews: data.pageviews ?? 0 }
}

async function fetchReferrers(days: number, limit: number): Promise<ReferrerRow[] | null> {
  const json = (await get('/visits/aggregate', {
    since: isoDaysAgo(days),
    until: new Date().toISOString(),
    // `by`, not `groupBy`. The docs show groupBy in the RESPONSE echo, which is
    // not the request parameter — sending groupBy returns
    // "Invalid request: missing required property `by`". Verified against the
    // live API.
    by: 'referrerHostname',
    limit: String(limit),
  })) as { data?: { referrerHostname?: string; visitors?: number; count?: number }[] } | null
  if (!Array.isArray(json?.data)) return null
  return json.data
    // The aggregate rows carry `visitors`; `count` is the fallback for the
    // event-shaped response, so a schema change degrades to a smaller number
    // rather than to zeroes everywhere.
    .map(row => ({ host: row.referrerHostname || 'direct', visitors: row.visitors ?? row.count ?? 0 }))
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
