import type { Metadata } from 'next'
import NotesEditor from '@/components/NotesEditor'
import ReleaseNotes from '@/components/ReleaseNotes'
import { filesFor, type Platform } from '@/lib/release'
import { listReleases, liveVersion, type Release } from '@/lib/releases'
import { readStats, summarize, type StatsSummary } from '@/lib/stats'
import { getLicenseStatus } from '@/lib/licenses'
import { storageMode } from '@/lib/store'
import { readFeedback } from '@/lib/feedback'
import FeedbackPanel from '@/components/FeedbackPanel'
import { deleteReleaseAction, logoutAction, saveReleaseAction, shipAction, unshipAction } from './actions'

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

const card = 'rounded-xl border border-line bg-panel p-5'
const th = 'pb-2 text-left font-mono text-[11px] uppercase tracking-wider text-faint'
const td = 'border-t border-line py-1.5 pr-4 text-sm text-muted'
const num = 'border-t border-line py-1.5 text-right font-mono text-sm text-fg'
const btn = 'rounded-md px-3 py-1.5 text-sm font-semibold transition-colors'

function StatTable({ title, rows, label }: { title: string; rows: [string, number][]; label: string }) {
  return (
    <div className={card}>
      <h3 className="font-display text-lg font-medium">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-faint">No data yet.</p>
      ) : (
        <table className="mt-3 w-full">
          <thead><tr><th className={th}>{label}</th><th className={`${th} text-right`}>Count</th></tr></thead>
          <tbody>
            {rows.map(([key, count]) => (
              <tr key={key}><td className={td}>{key || '—'}</td><td className={num}>{count}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function DailyBars({ summary }: { summary: StatsSummary }) {
  const max = Math.max(1, ...summary.days.map(d => d.views), ...summary.days.map(d => d.downloads))
  return (
    <div className={card}>
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-lg font-medium">Last 30 days</h3>
        <p className="font-mono text-xs text-faint">
          <span className="text-brass">■</span> views · <span className="text-ok">■</span> downloads
        </p>
      </div>
      <div className="mt-4 flex h-28 items-end gap-[3px]">
        {summary.days.map(d => (
          <div key={d.day} className="flex h-full flex-1 items-end gap-px" title={`${d.day} — ${d.views} views, ${d.downloads} downloads`}>
            <div className="w-1/2 rounded-t-sm bg-brass/70" style={{ height: `${Math.round((d.views / max) * 100)}%` }} />
            <div className="w-1/2 rounded-t-sm bg-ok/70" style={{ height: `${Math.round((d.downloads / max) * 100)}%` }} />
          </div>
        ))}
      </div>
    </div>
  )
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

const ERROR_MESSAGES: Record<string, string> = {
  'invalid-version': 'That version doesn\'t look right — use the form X.Y.Z (e.g. 0.9.3).',
  'save-failed': 'Could not save — the release store is unavailable. Check storage configuration and try again.',
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const [releases, live, stats, feedback, license] = await Promise.all([
    listReleases(),
    liveVersion(),
    readStats(),
    readFeedback(),
    getLicenseStatus(),
  ])
  const summary = summarize(stats, 30)
  const week = summarize(stats, 7)
  const binaries = Object.fromEntries(
    await Promise.all(releases.slice(0, 8).map(async r => [r.version, await binaryStatus(r.version)])),
  ) as Record<string, Record<Platform, boolean>>

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-5 py-10 sm:px-8">
      <header className="flex flex-wrap items-baseline gap-4">
        <h1 className="font-display text-3xl font-medium tracking-tight">Orchestra admin</h1>
        <span className="font-mono text-xs text-faint">live v{live}</span>
        <span className="font-mono text-xs text-faint">storage: {storageMode()}</span>
        <div className="ml-auto flex items-center gap-4">
          <a href="/releases" className="font-mono text-xs text-muted hover:text-fg">/releases →</a>
          <form action={logoutAction}>
            <button className="font-mono text-xs text-faint hover:text-fg">sign out</button>
          </form>
        </div>
      </header>

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

      <section className="mt-10">
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
              className="w-40 rounded-lg border border-line-strong bg-well px-3 py-2 font-mono text-sm text-fg outline-none focus:border-brass"
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

      <section className="mt-12">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <h2 className="font-display text-xl font-medium">Analytics</h2>
          <span className="font-mono text-xs text-faint">cookieless · aggregate only · no visitor IDs</span>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-5">
          {[
            ['Licenses remaining', `${license.remaining} / ${license.total}`],
            ['Views · 30d', summary.totalViews],
            ['Downloads · 30d', summary.totalDownloads],
            ['Views · 7d', week.totalViews],
            ['Downloads · 7d', week.totalDownloads],
          ].map(([label, value]) => (
            <div key={label} className={card}>
              <p className="font-mono text-[11px] uppercase tracking-wider text-faint">{label}</p>
              <p className="mt-1 font-display text-3xl text-fg">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <DailyBars summary={summary} />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <StatTable title="Downloads by platform" label="Platform" rows={summary.byPlatform} />
          <StatTable title="Top countries" label="Country" rows={summary.topCountries} />
          <StatTable title="Top pages" label="Path" rows={summary.topPages} />
          <StatTable title="Top referrers" label="Site" rows={summary.topReferrers} />
        </div>
      </section>

      <section className="mt-12">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <h2 className="font-display text-xl font-medium">Feedback &amp; testimonials</h2>
          <span className="font-mono text-xs text-faint">{feedback.length} total · from the desktop app</span>
        </div>
        <div className="mt-4">
          <FeedbackPanel entries={feedback} />
        </div>
      </section>
    </main>
  )
}
