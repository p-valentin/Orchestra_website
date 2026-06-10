import { readJson, writeJson } from './store'

// First-party, cookieless counters: nothing identifies a visitor — only
// aggregate counts per day, bucketed by platform/page/country/referrer.

export interface StatsFile {
  downloads: Record<string, Record<string, Record<string, number>>> // day → platform → country
  views: Record<string, Record<string, Record<string, number>>> // day → path → country
  referrers: Record<string, Record<string, number>> // day → host
}

const KEY = 'site/stats.json'
const KEEP_DAYS = 90

const EMPTY: StatsFile = { downloads: {}, views: {}, referrers: {} }

function today(): string {
  return new Date().toISOString().slice(0, 10)
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
  prune(stats.views)
  prune(stats.referrers)
  await writeJson(KEY, stats)
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

export function summarize(stats: StatsFile, daysBack: number): StatsSummary {
  const days: StatsSummary['days'] = []
  const byPlatform: Record<string, number> = {}
  const countries: Record<string, number> = {}
  const pages: Record<string, number> = {}
  const referrers: Record<string, number> = {}

  for (let i = daysBack - 1; i >= 0; i--) {
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
