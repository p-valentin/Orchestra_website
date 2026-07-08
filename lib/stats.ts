import { readJson, writeJson } from './store'

// First-party, cookieless counters: nothing identifies a visitor — only
// aggregate counts per day, bucketed by platform/page/country/referrer.

export interface StatsFile {
  downloads: Record<string, Record<string, Record<string, number>>> // day → platform → country
  views: Record<string, Record<string, Record<string, number>>> // day → path → country
  referrers: Record<string, Record<string, number>> // day → host
  // hour (YYYY-MM-DDTHH, UTC) → totals; kept 48h for the admin 24h chart.
  // Optional because stats.json files written before this field existed.
  hours?: Record<string, { views: number; downloads: number }>
}

const KEY = 'site/stats.json'
const KEEP_DAYS = 90
const KEEP_HOURS = 48

const EMPTY: StatsFile = { downloads: {}, views: {}, referrers: {}, hours: {} }

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function thisHour(): string {
  return new Date().toISOString().slice(0, 13)
}

function bumpHour(stats: StatsFile, metric: 'views' | 'downloads'): void {
  const hours = (stats.hours ??= {})
  const bucket = (hours[thisHour()] ??= { views: 0, downloads: 0 })
  bucket[metric] += 1
  const cutoff = new Date(Date.now() - KEEP_HOURS * 3_600_000).toISOString().slice(0, 13)
  for (const hour of Object.keys(hours)) {
    if (hour < cutoff) delete hours[hour]
  }
}

function prune(section: Record<string, unknown>): void {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10)
  for (const day of Object.keys(section)) {
    if (day < cutoff) delete section[day]
  }
}

export async function readStats(): Promise<StatsFile> {
  return readJson<StatsFile>(KEY, EMPTY)
}

export async function recordDownload(platform: string, country: string): Promise<void> {
  const stats = await readStats()
  const day = (stats.downloads[today()] ??= {})
  const byCountry = (day[platform] ??= {})
  byCountry[country] = (byCountry[country] || 0) + 1
  bumpHour(stats, 'downloads')
  prune(stats.downloads)
  await writeJson(KEY, stats)
}

export async function recordView(path: string, country: string, referrerHost: string): Promise<void> {
  const stats = await readStats()
  const day = (stats.views[today()] ??= {})
  const byCountry = (day[path] ??= {})
  byCountry[country] = (byCountry[country] || 0) + 1
  if (referrerHost) {
    const refs = (stats.referrers[today()] ??= {})
    refs[referrerHost] = (refs[referrerHost] || 0) + 1
  }
  bumpHour(stats, 'views')
  prune(stats.views)
  prune(stats.referrers)
  await writeJson(KEY, stats)
}

// The last `hoursBack` hours as a gap-filled series (oldest → newest) for the
// admin chart's 24h range. Hours started accruing when this field shipped, so
// early buckets may simply be absent — they render as zero.
export function hourlySeries(stats: StatsFile, hoursBack = 24): { hour: string; views: number; downloads: number }[] {
  const out: { hour: string; views: number; downloads: number }[] = []
  for (let i = hoursBack - 1; i >= 0; i--) {
    const hour = new Date(Date.now() - i * 3_600_000).toISOString().slice(0, 13)
    const bucket = stats.hours?.[hour]
    out.push({ hour, views: bucket?.views ?? 0, downloads: bucket?.downloads ?? 0 })
  }
  return out
}

export interface StatsSummary {
  days: { day: string; views: number; downloads: number }[]
  totalViews: number
  totalDownloads: number
  byPlatform: [string, number][]
  topCountries: [string, number][]
  topPages: [string, number][]
  topReferrers: [string, number][]
}

// `offset` shifts the window back in time: summarize(stats, 7, 7) is the week
// before last week, so callers can show period-over-period deltas.
export function summarize(stats: StatsFile, daysBack: number, offset = 0): StatsSummary {
  const days: StatsSummary['days'] = []
  const byPlatform: Record<string, number> = {}
  const countries: Record<string, number> = {}
  const pages: Record<string, number> = {}
  const referrers: Record<string, number> = {}

  for (let i = daysBack - 1 + offset; i >= offset; i--) {
    const day = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10)
    let views = 0
    let downloads = 0
    for (const [path, byCountry] of Object.entries(stats.views[day] || {})) {
      for (const [country, n] of Object.entries(byCountry)) {
        views += n
        pages[path] = (pages[path] || 0) + n
        countries[country] = (countries[country] || 0) + n
      }
    }
    for (const [platform, byCountry] of Object.entries(stats.downloads[day] || {})) {
      for (const [country, n] of Object.entries(byCountry)) {
        downloads += n
        byPlatform[platform] = (byPlatform[platform] || 0) + n
      }
    }
    for (const [host, n] of Object.entries(stats.referrers[day] || {})) {
      referrers[host] = (referrers[host] || 0) + n
    }
    days.push({ day, views, downloads })
  }

  const top = (record: Record<string, number>, limit = 10): [string, number][] =>
    Object.entries(record).sort((a, b) => b[1] - a[1]).slice(0, limit)

  return {
    days,
    totalViews: days.reduce((sum, d) => sum + d.views, 0),
    totalDownloads: days.reduce((sum, d) => sum + d.downloads, 0),
    byPlatform: top(byPlatform),
    topCountries: top(countries),
    topPages: top(pages),
    topReferrers: top(referrers),
  }
}
