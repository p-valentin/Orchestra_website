import type { Metadata } from 'next'
import NotesEditor from '@/components/NotesEditor'
import ReleaseNotes from '@/components/ReleaseNotes'
import { filesFor, type Platform } from '@/lib/release'
import { listReleases, liveVersion, type Release } from '@/lib/releases'
import { hourlySeries, readStats, summarize } from '@/lib/stats'
import AnalyticsChart from '@/components/AnalyticsChart'
import { getLicenseStatus } from '@/lib/licenses'
import { storageMode } from '@/lib/store'
import { readFeedback } from '@/lib/feedback'
import FeedbackPanel from '@/components/FeedbackPanel'
import { listGrants } from '@/lib/licenseGrants'
import { listClaims } from '@/lib/claims'
import { signLicense } from '@/lib/token'
import CopyButton from '@/components/CopyButton'
import { listAudit } from '@/lib/audit'
import { listPosts, type BlogPost } from '@/lib/blog'
import {
  deleteClaimAction,
  deletePostAction,
  deleteReleaseAction,
  grantLicenseAction,
  logoutAction,
  publishPostAction,
  revokeLicenseAction,
  savePostAction,
  saveReleaseAction,
  setLegacyClaimsAction,
  shipAction,
  unpublishPostAction,
  unshipAction,
} from './actions'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Admin — Orchestra',
  robots: { index: false, follow: false },
}

const PLATFORMS: Platform[] = ['mac', 'win', 'linux']

async function binaryStatus(version: string): Promise<Record<Platform, boolean>> {
  const base = process.env.R2_DOWNLOAD_BASE_URL
  const out = { mac: false, win: false, linux: false }
  if (!base) return out
  await Promise.all(PLATFORMS.map(async platform => {
    try {
      const res = await fetch(`${base}/${encodeURIComponent(filesFor(version)[platform].name)}`, {
        method: 'HEAD',
        cache: 'no-store',
      })
      out[platform] = res.ok
    } catch {}
  }))
  return out
}

const card = 'rounded-xl border border-line bg-panel p-4 sm:p-5'
const th = 'pb-2 text-left font-mono text-[11px] uppercase tracking-wider text-faint'
const td = 'border-t border-line py-1.5 pr-4 text-sm text-muted'
const num = 'border-t border-line py-1.5 text-right font-mono text-sm text-fg'
const btn = 'rounded-md px-3 py-1.5 text-sm font-semibold transition-colors'
const input = 'rounded-lg border border-line-strong bg-well px-3 py-2 font-mono text-sm text-fg outline-none focus:border-brass'
const section = 'mt-12 scroll-mt-16'

const NAV = [
  ['#overview', 'Overview'],
  ['#releases', 'Releases'],
  ['#blog', 'Blog'],
  ['#licenses', 'Licenses'],
  ['#claims', 'Claims'],
  ['#feedback', 'Feedback'],
  ['#activity', 'Activity'],
] as const

function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function StatTable({ title, rows, label }: { title: string; rows: [string, number][]; label: string }) {
  const total = rows.reduce((sum, [, count]) => sum + count, 0)
  return (
    <div className={card}>
      <h3 className="font-display text-lg font-medium">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-faint">No data yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="mt-3 w-full">
            <thead>
              <tr>
                <th className={th}>{label}</th>
                <th className={`${th} text-right`}>Count</th>
                <th className={`${th} w-16 text-right`}>Share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([key, count]) => (
                <tr key={key}>
                  <td className={td}>{key || '—'}</td>
                  <td className={num}>{count}</td>
                  <td className={`${num} text-faint`}>{total > 0 ? Math.round((count / total) * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// Period-over-period delta for a stat tile: signed, against the named prior
// window, colored by direction (more views/downloads is always good here).
function withTrend(current: number, previous: number, period: string): { sub: string; subCls: string } {
  if (previous === 0 && current === 0) return { sub: `no change vs prior ${period}`, subCls: 'text-faint' }
  if (previous === 0) return { sub: `▲ new vs prior ${period} (0)`, subCls: 'text-ok' }
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct > 0) return { sub: `▲ ${pct}% vs prior ${period}`, subCls: 'text-ok' }
  if (pct < 0) return { sub: `▼ ${Math.abs(pct)}% vs prior ${period}`, subCls: 'text-[#f0a8a2]' }
  return { sub: `flat vs prior ${period}`, subCls: 'text-faint' }
}

function ReleaseRow({ release, live, binaries }: { release: Release; live: string; binaries: Record<Platform, boolean> }) {
  const isLive = release.publishedAt && release.version === live
  return (
    <div className="border-t border-line py-4 first:border-t-0">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-lg text-fg">v{release.version}</span>
        {isLive ? (
          <span className="rounded-full bg-ok/15 px-2.5 py-0.5 font-mono text-[11px] text-ok">live</span>
        ) : release.publishedAt ? (
          <span className="rounded-full bg-brass/15 px-2.5 py-0.5 font-mono text-[11px] text-brass">published</span>
        ) : (
          <span className="rounded-full bg-well px-2.5 py-0.5 font-mono text-[11px] text-faint">draft</span>
        )}
        <span className="font-mono text-xs text-faint">
          {PLATFORMS.map(p => `${p} ${binaries[p] ? '✓' : '✗'}`).join(' · ')}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {release.publishedAt ? (
            <form action={unshipAction}>
              <input type="hidden" name="version" value={release.version} />
              <button className={`${btn} border border-line-strong text-muted hover:text-fg`}>Unship</button>
            </form>
          ) : (
            <>
              <form action={shipAction}>
                <input type="hidden" name="version" value={release.version} />
                <button className={`${btn} bg-brass text-[#1a1306] hover:bg-brass-bright`}>Ship</button>
              </form>
              <form action={deleteReleaseAction}>
                <input type="hidden" name="version" value={release.version} />
                <button className={`${btn} border border-line text-faint hover:border-[#e06c63]/60 hover:text-[#f0a8a2]`}>Delete</button>
              </form>
            </>
          )}
        </div>
      </div>
      <div className="mt-3 rounded-lg border border-line-strong bg-well px-3 py-2">
        {release.notes.trim() ? (
          <ReleaseNotes text={release.notes} />
        ) : (
          <p className="text-sm text-faint">No notes yet.</p>
        )}
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer font-mono text-xs text-faint hover:text-muted">edit notes</summary>
        <form action={saveReleaseAction} className="mt-3 flex flex-col gap-2">
          <input type="hidden" name="version" value={release.version} />
          <NotesEditor key={release.notes} name="notes" rows={8} defaultValue={release.notes} />
          <button className={`${btn} self-start border border-brass/50 text-brass-bright hover:bg-brass hover:text-[#1a1306]`}>
            Save notes
          </button>
        </form>
      </details>
    </div>
  )
}

function PostRow({ post }: { post: BlogPost }) {
  return (
    <div className="border-t border-line py-4 first:border-t-0">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-display text-lg text-fg">{post.title}</span>
        {post.publishedAt ? (
          <span className="rounded-full bg-ok/15 px-2.5 py-0.5 font-mono text-[11px] text-ok">published</span>
        ) : (
          <span className="rounded-full bg-well px-2.5 py-0.5 font-mono text-[11px] text-faint">draft</span>
        )}
        <span className="font-mono text-xs text-faint">/blog/{post.slug}</span>
        <div className="ml-auto flex items-center gap-2">
          {post.publishedAt ? (
            <>
              <a href={`/blog/${post.slug}`} className="font-mono text-xs text-muted hover:text-fg">view →</a>
              <form action={unpublishPostAction}>
                <input type="hidden" name="slug" value={post.slug} />
                <button className={`${btn} border border-line-strong text-muted hover:text-fg`}>Unpublish</button>
              </form>
            </>
          ) : (
            <>
              <form action={publishPostAction}>
                <input type="hidden" name="slug" value={post.slug} />
                <button className={`${btn} bg-brass text-[#1a1306] hover:bg-brass-bright`}>Publish</button>
              </form>
              <form action={deletePostAction}>
                <input type="hidden" name="slug" value={post.slug} />
                <button className={`${btn} border border-line text-faint hover:border-[#e06c63]/60 hover:text-[#f0a8a2]`}>Delete</button>
              </form>
            </>
          )}
        </div>
      </div>
      {post.description && <p className="mt-1 text-sm text-faint">{post.description}</p>}
      <details className="mt-2">
        <summary className="cursor-pointer font-mono text-xs text-faint hover:text-muted">edit post</summary>
        <form action={savePostAction} className="mt-3 flex flex-col gap-2">
          <input type="hidden" name="slug" value={post.slug} />
          <input name="title" defaultValue={post.title} required maxLength={120} className={`${input} w-full max-w-xl`} />
          <input name="description" defaultValue={post.description} maxLength={200} placeholder="one-line description (meta + list page)" className={`${input} w-full max-w-xl`} />
          <NotesEditor key={post.updatedAt} name="body" rows={14} defaultValue={post.body} />
          <button className={`${btn} self-start border border-brass/50 text-brass-bright hover:bg-brass hover:text-[#1a1306]`}>
            Save post
          </button>
        </form>
      </details>
    </div>
  )
}

const ERROR_MESSAGES: Record<string, string> = {
  'invalid-version': 'That version doesn\'t look right — use the form X.Y.Z (e.g. 0.9.3).',
  'save-failed': 'Could not save — the release store is unavailable. Check storage configuration and try again.',
  'invalid-email': 'That email doesn\'t look right — check it and try again.',
  'invalid-count': 'Legacy claims must be a whole number between 0 and 50.',
  'invalid-post': 'The post needs a title (the URL slug is derived from it).',
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const [releases, live, stats, feedback, license, grants, claims, audit, posts] = await Promise.all([
    listReleases(),
    liveVersion(),
    readStats(),
    readFeedback(),
    getLicenseStatus(),
    listGrants(),
    listClaims(),
    listAudit(),
    listPosts(),
  ])
  const summary = summarize(stats, 30)
  const week = summarize(stats, 7)
  const today = summarize(stats, 1)
  const yesterday = summarize(stats, 1, 1)
  const prevWeek = summarize(stats, 7, 7)
  const prevMonth = summarize(stats, 30, 30)
  const quarter = summarize(stats, 90)
  const activeGrants = grants.filter(g => g.status === 'active').length
  const conversion = summary.totalViews > 0
    ? `${((summary.totalDownloads / summary.totalViews) * 100).toFixed(1)}%`
    : '—'
  const prevConversion = prevMonth.totalViews > 0
    ? `${((prevMonth.totalDownloads / prevMonth.totalViews) * 100).toFixed(1)}% prior 30d`
    : 'no prior data'
  const binaries = Object.fromEntries(
    await Promise.all(releases.slice(0, 8).map(async r => [r.version, await binaryStatus(r.version)])),
  ) as Record<string, Record<Platform, boolean>>

  const claims7d = claims.filter(c => Date.now() - c.issuedAt < 7 * 86_400_000).length
  const claims30d = claims.filter(c => Date.now() - c.issuedAt < 30 * 86_400_000).length
  const claimsBySource = Object.entries(
    claims.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.source]: (acc[c.source] ?? 0) + 1 }), {}),
  ).sort((a, b) => b[1] - a[1])

  const faint = 'text-faint'
  const tiles: { label: string; value: string | number; sub: string; subCls: string }[] = [
    { label: 'Views · today', value: today.totalViews, sub: `${yesterday.totalViews} yesterday`, subCls: faint },
    { label: 'Downloads · today', value: today.totalDownloads, sub: `${yesterday.totalDownloads} yesterday`, subCls: faint },
    { label: 'Views · 7d', value: week.totalViews, ...withTrend(week.totalViews, prevWeek.totalViews, '7d') },
    { label: 'Downloads · 7d', value: week.totalDownloads, ...withTrend(week.totalDownloads, prevWeek.totalDownloads, '7d') },
    { label: 'Views · 30d', value: summary.totalViews, ...withTrend(summary.totalViews, prevMonth.totalViews, '30d') },
    { label: 'Downloads · 30d', value: summary.totalDownloads, ...withTrend(summary.totalDownloads, prevMonth.totalDownloads, '30d') },
    { label: 'Conversion · 30d', value: conversion, sub: prevConversion, subCls: faint },
    {
      label: 'Licenses claimed', value: `${license.claimed}/${license.total}`,
      sub: license.closed ? 'window closed' : license.cutoff ? `until ${formatDay(license.cutoff)}` : 'window open',
      subCls: faint,
    },
  ]

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 pb-16 sm:px-8">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 pt-8">
        <h1 className="font-display text-2xl font-medium tracking-tight sm:text-3xl">Orchestra admin</h1>
        <span className="font-mono text-xs text-faint">live v{live}</span>
        <span className="font-mono text-xs text-faint">storage: {storageMode()}</span>
        <div className="ml-auto flex items-center gap-4">
          <a href="/releases" className="font-mono text-xs text-muted hover:text-fg">/releases →</a>
          <form action={logoutAction}>
            <button className="font-mono text-xs text-faint hover:text-fg">sign out</button>
          </form>
        </div>
      </header>

      <nav
        aria-label="Sections"
        className="sticky top-0 z-10 -mx-4 mt-4 flex gap-1 overflow-x-auto border-b border-line bg-bg/90 px-4 py-2 backdrop-blur-md sm:-mx-8 sm:px-8"
      >
        {NAV.map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="whitespace-nowrap rounded-md px-3 py-1 font-mono text-xs text-muted transition-colors hover:bg-well hover:text-fg"
          >
            {label}
          </a>
        ))}
      </nav>

      {error && ERROR_MESSAGES[error] && (
        <p className="mt-4 rounded-lg border border-[#e06c63]/40 bg-[#e06c63]/10 px-4 py-3 text-sm text-[#f0a8a2]">
          {ERROR_MESSAGES[error]}
        </p>
      )}

      {storageMode() === 'local' && process.env.VERCEL && (
        <p className="mt-4 rounded-lg border border-[#e06c63]/40 bg-[#e06c63]/10 px-4 py-3 text-sm text-[#f0a8a2]">
          R2 storage is not configured — data won&apos;t persist on Vercel. Set R2_ENDPOINT, R2_BUCKET,
          R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.
        </p>
      )}

      <section id="overview" className="mt-8 scroll-mt-16">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <h2 className="font-display text-xl font-medium">Overview</h2>
          <span className="font-mono text-xs text-faint">cookieless · aggregate only · no visitor IDs</span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {tiles.map(tile => (
            <div key={tile.label} className={card}>
              <p className="font-mono text-[11px] uppercase tracking-wider text-faint">{tile.label}</p>
              <p className="mt-1 font-display text-2xl text-fg sm:text-3xl">{tile.value}</p>
              <p className={`mt-0.5 font-mono text-[11px] ${tile.subCls}`}>{tile.sub}</p>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <AnalyticsChart days={quarter.days} hours={hourlySeries(stats)} />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <StatTable title="Downloads by platform" label="Platform" rows={summary.byPlatform} />
          <StatTable title="Top countries" label="Country" rows={summary.topCountries} />
          <StatTable title="Top pages" label="Path" rows={summary.topPages} />
          <StatTable title="Top referrers" label="Site" rows={summary.topReferrers} />
        </div>
      </section>

      <section id="releases" className={section}>
        <h2 className="font-display text-xl font-medium">Releases</h2>
        <p className="mt-1 text-sm text-faint">
          Drafts are invisible to visitors. Shipping flips /releases and the download links to the new version.
        </p>

        <div className={`${card} mt-4`}>
          <h3 className="font-display text-lg font-medium">New release</h3>
          <form action={saveReleaseAction} className="mt-3 flex flex-col gap-2">
            <input
              name="version"
              placeholder="0.9.3"
              pattern="\d+\.\d+\.\d+"
              required
              className={`${input} w-40`}
            />
            <NotesEditor
              key={releases.length}
              name="notes"
              rows={6}
              placeholder={'## Highlights\n- New Each mode iterates DOM elements\n- Text selectors now work without a <label>'}
            />
            <button className={`${btn} self-start bg-brass text-[#1a1306] hover:bg-brass-bright`}>Save draft</button>
          </form>
        </div>

        <div className={`${card} mt-4`}>
          {releases.length === 0 ? (
            <p className="text-sm text-faint">No releases yet — save a draft above.</p>
          ) : (
            releases.map(r => (
              <ReleaseRow
                key={r.version}
                release={r}
                live={live}
                binaries={binaries[r.version] ?? { mac: false, win: false, linux: false }}
              />
            ))
          )}
        </div>
      </section>

      <section id="blog" className={section}>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <h2 className="font-display text-xl font-medium">Blog</h2>
          <span className="font-mono text-xs text-faint">
            {posts.filter(p => p.publishedAt).length} published · drafts are invisible on /blog
          </span>
        </div>

        <div className={`${card} mt-4`}>
          <h3 className="font-display text-lg font-medium">New post</h3>
          <form action={savePostAction} className="mt-3 flex flex-col gap-2">
            <input name="title" placeholder="Post title" required maxLength={120} className={`${input} w-full max-w-xl`} />
            <input name="description" placeholder="one-line description (meta + list page)" maxLength={200} className={`${input} w-full max-w-xl`} />
            <NotesEditor
              key={posts.length}
              name="body"
              rows={10}
              placeholder={'Write in markdown. First save creates a draft; publish when ready.'}
            />
            <button className={`${btn} self-start bg-brass text-[#1a1306] hover:bg-brass-bright`}>Save draft</button>
          </form>
        </div>

        <div className={`${card} mt-4`}>
          {posts.length === 0 ? (
            <p className="text-sm text-faint">No posts yet — write one above.</p>
          ) : (
            posts.map(p => <PostRow key={p.slug} post={p} />)
          )}
        </div>
      </section>

      <section id="licenses" className={section}>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <h2 className="font-display text-xl font-medium">Licenses</h2>
          <span className="font-mono text-xs text-faint">
            {activeGrants} active · grant after each purchase; the app picks it up on next sign-in or refresh
          </span>
        </div>

        <div className={`${card} mt-4`}>
          <form action={grantLicenseAction} className="flex flex-wrap items-center gap-2">
            <input
              name="email"
              type="email"
              placeholder="buyer@example.com"
              required
              className={`${input} w-full sm:w-64`}
            />
            <input
              name="note"
              placeholder="note (order ref, source…)"
              className={`${input} w-full sm:w-56`}
            />
            <button className={`${btn} bg-brass text-[#1a1306] hover:bg-brass-bright`}>Grant lifetime</button>
          </form>

          {grants.length === 0 ? (
            <p className="mt-4 text-sm text-faint">No licenses granted yet. Legacy free-window claims are honored separately and don&apos;t appear here.</p>
          ) : (
            <div className="mt-4">
              {grants.map(g => (
                <div key={g.email} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-2.5">
                  <span className="break-all font-mono text-sm text-muted">{g.email}</span>
                  {g.status === 'active' ? (
                    <span className="rounded-full bg-ok/15 px-2.5 py-0.5 font-mono text-[11px] text-ok">active</span>
                  ) : (
                    <span className="rounded-full bg-[#e06c63]/15 px-2.5 py-0.5 font-mono text-[11px] text-[#f0a8a2]">revoked</span>
                  )}
                  <span className="font-mono text-xs text-faint">{formatDay(g.createdAt)}</span>
                  {g.note && <span className="text-xs text-faint">{g.note}</span>}
                  <div className="ml-auto">
                    {g.status === 'active' ? (
                      <form action={revokeLicenseAction}>
                        <input type="hidden" name="email" value={g.email} />
                        <button className="font-mono text-xs text-faint hover:text-[#f0a8a2]">revoke</button>
                      </form>
                    ) : (
                      <form action={grantLicenseAction}>
                        <input type="hidden" name="email" value={g.email} />
                        <button className="font-mono text-xs text-faint hover:text-ok">re-grant</button>
                      </form>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section id="claims" className={section}>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <h2 className="font-display text-xl font-medium">Free-window claims</h2>
          <span className="font-mono text-xs text-faint">
            {license.recordedClaims} recorded + {license.legacyClaims} legacy = {license.claimed} of {license.total} claimed · {license.remaining} left
          </span>
          <span className="font-mono text-xs text-faint">
            {claims7d} in last 7d · {claims30d} in last 30d
            {claimsBySource.length > 0 && <> · by source: {claimsBySource.map(([source, n]) => `${source} ${n}`).join(' · ')}</>}
          </span>
        </div>

        <div className={`${card} mt-4`}>
          <form action={setLegacyClaimsAction} className="flex flex-wrap items-center gap-2">
            <label htmlFor="legacy-count" className="text-sm text-muted">Legacy claims (before per-email records existed):</label>
            <input
              id="legacy-count"
              name="count"
              type="number"
              min={0}
              max={license.total}
              defaultValue={license.legacyClaims}
              required
              className={`${input} w-24`}
            />
            <button className={`${btn} border border-brass/50 text-brass-bright hover:bg-brass hover:text-[#1a1306]`}>Save</button>
          </form>
          <p className="mt-2 text-xs text-faint">
            Early claimers have no record below — this offset stands in for them. If one of them re-claims
            in the app they gain a record; lower the offset by one then, or the count double-books.
          </p>

          {claims.length === 0 ? (
            <p className="mt-4 text-sm text-faint">No recorded claims yet.</p>
          ) : (
            <div className="mt-4">
              {claims.map(c => {
                // Tokens are deterministic (same payload ⇒ same signature), so
                // the key shown here is exactly what the claimer would have —
                // copy it into a personal email to deliver their license.
                const token = signLicense({ email: c.email, plan: c.plan, issuedAt: c.issuedAt })
                return (
                  <div key={c.email} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-2.5">
                    <span className="break-all font-mono text-sm text-muted">{c.email}</span>
                    <span className="rounded-full bg-well px-2.5 py-0.5 font-mono text-[11px] text-faint">{c.source}</span>
                    {token && <CopyButton text={token} label="copy key" />}
                    <span className="ml-auto font-mono text-xs text-faint">{formatDay(c.issuedAt)}</span>
                    <form action={deleteClaimAction}>
                      <input type="hidden" name="email" value={c.email} />
                      <button className="font-mono text-xs text-faint hover:text-[#f0a8a2]">remove</button>
                    </form>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      <section id="feedback" className={section}>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <h2 className="font-display text-xl font-medium">Feedback &amp; testimonials</h2>
          <span className="font-mono text-xs text-faint">{feedback.length} total · from the desktop app</span>
        </div>
        <div className="mt-4">
          <FeedbackPanel entries={feedback} />
        </div>
      </section>

      <section id="activity" className={section}>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <h2 className="font-display text-xl font-medium">Recent activity</h2>
          <span className="font-mono text-xs text-faint">logins and admin actions · last {audit.length}</span>
        </div>
        <div className={`${card} mt-4`}>
          {audit.length === 0 ? (
            <p className="text-sm text-faint">Nothing yet — actions and logins will show up here.</p>
          ) : (
            <div>
              {audit.map((entry, i) => (
                <div key={`${entry.at}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-2 first:border-t-0">
                  <span className="font-mono text-xs text-faint">{formatTime(entry.at)}</span>
                  <span className={`rounded-full px-2.5 py-0.5 font-mono text-[11px] ${entry.action === 'login-failed' ? 'bg-[#e06c63]/15 text-[#f0a8a2]' : 'bg-well text-muted'}`}>
                    {entry.action}
                  </span>
                  {entry.detail && <span className="break-all font-mono text-xs text-muted">{entry.detail}</span>}
                  {entry.ip && <span className="ml-auto font-mono text-[11px] text-faint">{entry.ip}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
