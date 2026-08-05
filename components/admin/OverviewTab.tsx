import AnalyticsChart from '@/components/AnalyticsChart'
import { hourlySeries, readStats, summarize, versionRows } from '@/lib/stats'
import { adminDataConfigured, getAdminMetrics, type AdminMetrics } from '@/lib/adminData'
import { analyticsConfigured, topReferrers, visitorTotals } from '@/lib/vercelAnalytics'
import { sensitiveDataUnlocked } from '@/lib/totp'
import { card, section, StatTable, TileGrid, withTrend, type Tile } from './ui'

// The overview, in funnel order: traffic → product → usage.
//
// Everything here is fetched in ONE Promise.all. The page used to run a
// nine-call fan-out on every tab whether or not it showed any of it; now each
// tab asks for what it renders and nothing else, and this — the tab that
// genuinely needs a lot — is the only expensive one.

const faint = 'text-faint'

function pct(numerator: number, denominator: number): string {
  if (denominator <= 0) return '—'
  return `${((numerator / denominator) * 100).toFixed(1)}%`
}

function dash(value: number | undefined): string | number {
  return value === undefined ? '—' : value
}

function trafficTiles(
  stats: ReturnType<typeof summarize>,
  prior: ReturnType<typeof summarize>,
  uniques: { visitors: number; pageviews: number } | null,
  recent: { visitors: number; pageviews: number } | null,
): Tile[] {
  return [
    uniques
      ? {
        label: 'Unique visitors · 30d',
        value: uniques.visitors,
        // No period-over-period arrow here on purpose. The Hobby plan only
        // exposes the latest 31 days, so the prior 30 cannot be fetched at
        // all — and a trend computed against a window we cannot see reads
        // "▲ new vs prior 30d (0)", which says the traffic is brand new when
        // the truth is that we simply have no view of it. A real subset of
        // the window we DO have is worth more than an invented comparison.
        sub: recent ? `${recent.visitors} in the last 7 days` : 'real people, de-duplicated',
        subCls: faint,
      }
      : {
        label: 'Unique visitors · 30d',
        value: '—',
        sub: 'set ANALYTICS_API_TOKEN',
        subCls: faint,
      },
    { label: 'Pageviews · 30d', value: stats.totalViews, ...withTrend(stats.totalViews, prior.totalViews, '30d') },
    {
      label: 'Downloads · 30d',
      value: stats.totalDownloads,
      ...withTrend(stats.totalDownloads, prior.totalDownloads, '30d'),
    },
    {
      label: 'Visitor → download',
      value: uniques ? pct(stats.totalDownloads, uniques.visitors) : pct(stats.totalDownloads, stats.totalViews),
      sub: uniques ? 'of unique visitors' : 'of pageviews',
      subCls: faint,
    },
  ]
}

function productTiles(metrics: AdminMetrics): Tile[] {
  const { accounts, trials, licenses } = metrics
  return [
    {
      label: 'Accounts',
      value: accounts.total,
      sub: `${accounts.new_7d} new this week · ${accounts.confirmed} confirmed`,
      subCls: faint,
    },
    {
      label: 'Trials running',
      value: trials.running,
      sub: `${trials.started_30d} started in 30d`,
      subCls: faint,
    },
    {
      label: 'Paid licenses',
      value: licenses.paid,
      // The number that would otherwise be quietly wrong. Beta grants carry an
      // order_id too, so a naive count reports them as sales.
      sub: `+ ${licenses.granted} granted (beta/legacy)`,
      subCls: licenses.paid === 0 && licenses.granted > 0 ? 'text-brass' : faint,
    },
    {
      label: 'Trial → paid',
      value: pct(licenses.paid, trials.total),
      sub: trials.expired_unconverted > 0 ? `${trials.expired_unconverted} expired unconverted` : 'no expired trials',
      subCls: faint,
    },
  ]
}

function usageTiles(metrics: AdminMetrics): Tile[] {
  const { active, accounts } = metrics
  const topVersion = Object.entries(metrics.versions).sort((a, b) => b[1] - a[1])[0]
  const totalDevices = active.devices_total || 1
  return [
    { label: 'Active today', value: active.dau, sub: `${active.devices_dau} devices`, subCls: faint },
    { label: 'Active this week', value: active.wau, sub: `of ${accounts.total} accounts`, subCls: faint },
    { label: 'Active this month', value: active.mau, sub: `${active.devices_total} devices registered`, subCls: faint },
    {
      label: 'Latest version',
      value: topVersion ? `${Math.round((topVersion[1] / totalDevices) * 100)}%` : '—',
      sub: topVersion ? `on v${topVersion[0]}` : 'no devices yet',
      subCls: faint,
    },
  ]
}

export default async function OverviewTab() {
  const metricsAvailable = sensitiveDataUnlocked() && adminDataConfigured()
  const [stats, metrics, uniques, recentUniques, referrers] = await Promise.all([
    readStats(),
    metricsAvailable ? getAdminMetrics() : Promise.resolve(null),
    analyticsConfigured() ? visitorTotals(30) : Promise.resolve(null),
    analyticsConfigured() ? visitorTotals(7) : Promise.resolve(null),
    analyticsConfigured() ? topReferrers(30, 10) : Promise.resolve(null),
  ])

  const summary = summarize(stats, 30)
  const prevMonth = summarize(stats, 30, 30)
  const quarter = summarize(stats, 90)

  return (
    <section id="overview" className={section}>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <h2 className="font-display text-xl font-medium">Overview</h2>
        <span className="font-mono text-xs text-faint">
          site counters are cookieless · unique visitors come from Vercel · app usage from device check-ins
        </span>
      </div>

      <TileGrid heading="Traffic" tiles={trafficTiles(summary, prevMonth, uniques, recentUniques)} />

      {metrics ? (
        <>
          <TileGrid heading="Product" tiles={productTiles(metrics)} />
          <TileGrid heading="Usage" tiles={usageTiles(metrics)} />
        </>
      ) : (
        <div className={`${card} mt-6`}>
          <p className="text-sm text-muted">
            {!sensitiveDataUnlocked()
              ? 'Account, trial and licence numbers are hidden until two-factor authentication is enabled. Set ADMIN_TOTP_SECRET and sign in again.'
              : !adminDataConfigured()
                ? 'Not configured. Set ADMIN_DATA_SECRET (32+ characters) on both Vercel and Supabase to see accounts, trials, licences and active users.'
                : 'Couldn’t reach the licensing backend, so product and usage numbers are unavailable. Traffic above is unaffected.'}
          </p>
        </div>
      )}

      <div className="mt-6">
        <AnalyticsChart days={quarter.days} hours={hourlySeries(stats)} dau={metrics?.dau_series ?? []} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <StatTable title="Downloads by platform" label="Platform" rows={summary.byPlatform} />
        <StatTable title="Downloads by version" label="Version" rows={versionRows(stats, 30)} />
        {referrers && referrers.length > 0 ? (
          <StatTable
            title="Top referrers (unique visitors)"
            label="Site"
            rows={referrers.map(r => [r.host, r.visitors] as [string, number])}
          />
        ) : (
          <StatTable title="Top referrers" label="Site" rows={summary.topReferrers} />
        )}
        <StatTable
          title="Downloads by source"
          label="Source"
          rows={summary.topDownloadReferrers}
        />
        <StatTable title="Top pages" label="Path" rows={summary.topPages} />
        <StatTable title="Top countries" label="Country" rows={summary.topCountries} />
        {metrics && (
          <StatTable
            title="Devices by platform"
            label="Platform"
            rows={Object.entries(metrics.platforms).sort((a, b) => b[1] - a[1])}
          />
        )}
        {metrics && (
          <StatTable
            title="App version adoption"
            label="Version"
            rows={Object.entries(metrics.versions).sort((a, b) => b[1] - a[1])}
          />
        )}
      </div>

      {metrics && metrics.dau_series.length === 0 && (
        <p className="mt-4 font-mono text-[11px] text-faint">
          Daily-active history starts accruing from the first check-in after this deploy — devices.last_seen_at
          only ever held “now”, so there is no past to backfill.
        </p>
      )}
    </section>
  )
}
