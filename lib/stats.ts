import { readJson, updateJson } from './store'

// First-party, cookieless counters: nothing identifies a visitor — only
// aggregate counts per day, bucketed by platform/page/country/referrer.

export interface StatsFile {
  downloads: Record<string, Record<string, Record<string, number>>> // day → platform → country
  views: Record<string, Record<string, Record<string, number>>> // day → path → country
  referrers: Record<string, Record<string, number>> // day → host
  // hour (YYYY-MM-DDTHH, UTC) → totals; kept 48h for the admin 24h chart.
  // Optional because stats.json files written before this field existed.
  hours?: Record<string, { views: number; downloads: number }>
  // day → version → count. Answers "how did the last release land" without
  // needing a second store. Optional for the same reason as `hours`: files
  // written before this field existed must still parse.
  versions?: Record<string, Record<string, number>>
  // day → host → count, for downloads specifically. `referrers` tells you which
  // channel produced traffic; this tells you which produced *installs*, and
  // only the second one is worth steering on — a launch that sends 4,000
  // readers and 12 installs and one that sends 400 readers and 90 installs look
  // nearly identical in `referrers` and could not be more different. Optional
  // for the same reason as `hours`: older files must still parse.
  downloadReferrers?: Record<string, Record<string, number>>
}

const KEY = 'site/stats.json'
const KEEP_DAYS = 90
const KEEP_HOURS = 48

const EMPTY: StatsFile = { downloads: {}, views: {}, referrers: {}, hours: {}, versions: {}, downloadReferrers: {} }

// Crawlers, link unfurlers and prefetchers. They are not people downloading the
// app, and counting them makes the one number the business cares about drift
// upward for no reason. Deliberately a short list of things that SAY what they
// are — fingerprinting real browsers to guess at intent would be both less
// accurate and a worse thing to build.
const BOT_UA = /bot|crawler|spider|crawling|slurp|curl|wget|python-requests|headlesschrome|facebookexternalhit|whatsapp|telegrambot|slackbot|discordbot|preview|monitor|pingdom|uptime|lighthouse|semrush|ahrefs|dataprovider|scrapy/i

export function isBotUserAgent(userAgent: string | null): boolean {
  if (!userAgent) return true // no UA at all is a script, not a person
  return BOT_UA.test(userAgent)
}

// The referrer hostname, or '' for direct / same-site / unparseable. Shared by
// the pageview beacon and the download route so a visit and the install it
// leads to land in the same bucket — if one of them normalised differently,
// comparing views to downloads per channel would silently compare two
// different things. `selfHost` is the site's own host, which is not a referral.
export function refererHost(referer: string | null, selfHost: string | null): string {
  if (!referer) return ''
  try {
    const host = new URL(referer).hostname
    if (!host) return ''
    if (selfHost && host.includes(selfHost)) return ''
    return host.replace(/^www\./, '').slice(0, 100)
  } catch {
    return ''
  }
}

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

// For READING. A transient failure here shows an empty dashboard for one
// render, which is harmless and self-correcting.
export async function readStats(): Promise<StatsFile> {
  return readJson<StatsFile>(KEY, EMPTY)
}

// Both counters below go through updateJson, which reads, applies the change,
// and writes CONDITIONALLY on the object not having moved underneath it.
//
// This module previously did a plain read-modify-write through readJson, and
// lost data two different ways:
//
//   - readJson turns any failure into EMPTY, so one transient read error made
//     the next write replace the whole file with a single hit. Not an
//     undercount — a silent delete, repeating on every blip. That is why daily
//     views kept collapsing to ~1 while Vercel Analytics saw a normal day.
//   - two hits arriving together both read the same version and both wrote, so
//     one increment vanished. Ordinary on any page with a burst of traffic.
//
// store.ts spells out the first hazard, and audit.ts and blog.ts both respect
// it. This file did not.

// One counted download. `version` is what was actually served, so the admin
// page can show how a release landed rather than only how many downloads there
// were in total.
//
// Worth being explicit, because it is the question this number always gets
// asked: AUTO-UPDATES ARE NOT IN HERE. electron-updater fetches latest*.yml
// straight from downloads.orchestra-automation.com and never touches this app,
// so every row below is somebody choosing to install.
export async function recordDownload(
  platform: string,
  country: string,
  version?: string,
  referrerHost?: string,
): Promise<void> {
  await updateJson<StatsFile>(KEY, EMPTY, stats => {
    const day = (stats.downloads[today()] ??= {})
    const byCountry = (day[platform] ??= {})
    byCountry[country] = (byCountry[country] || 0) + 1
    if (referrerHost) {
      const refs = (stats.downloadReferrers ??= {})
      const byHost = (refs[today()] ??= {})
      byHost[referrerHost] = (byHost[referrerHost] || 0) + 1
      prune(refs)
    }
    if (version) {
      const versions = (stats.versions ??= {})
      const byVersion = (versions[today()] ??= {})
      byVersion[version] = (byVersion[version] || 0) + 1
      prune(versions)
    }
    bumpHour(stats, 'downloads')
    prune(stats.downloads)
  })
}

export async function recordView(path: string, country: string, referrerHost: string): Promise<void> {
  await updateJson<StatsFile>(KEY, EMPTY, stats => {
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
  })
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

// Downloads per version over the last `daysBack` days, most-downloaded first.
export function versionRows(stats: StatsFile, daysBack = 30): [string, number][] {
  const totals: Record<string, number> = {}
  for (let i = daysBack - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10)
    for (const [version, n] of Object.entries(stats.versions?.[day] ?? {})) {
      totals[version] = (totals[version] || 0) + n
    }
  }
  return Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 10)
}

export interface StatsSummary {
  days: { day: string; views: number; downloads: number }[]
  totalViews: number
  totalDownloads: number
  byPlatform: [string, number][]
  topCountries: [string, number][]
  topPages: [string, number][]
  topReferrers: [string, number][]
  // Which channel produced INSTALLS, not just visits. The pair of tables is the
  // point: a source high in topReferrers and absent here sent readers, not users.
  topDownloadReferrers: [string, number][]
}

// `offset` shifts the window back in time: summarize(stats, 7, 7) is the week
// before last week, so callers can show period-over-period deltas.
export function summarize(stats: StatsFile, daysBack: number, offset = 0): StatsSummary {
  const days: StatsSummary['days'] = []
  const byPlatform: Record<string, number> = {}
  const countries: Record<string, number> = {}
  const pages: Record<string, number> = {}
  const referrers: Record<string, number> = {}
  const downloadReferrers: Record<string, number> = {}

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
    for (const [host, n] of Object.entries(stats.downloadReferrers?.[day] || {})) {
      downloadReferrers[host] = (downloadReferrers[host] || 0) + n
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
    topDownloadReferrers: top(downloadReferrers),
  }
}
