import NotesEditor from '@/components/NotesEditor'
import ReleaseNotes from '@/components/ReleaseNotes'
import { filesFor, type Platform } from '@/lib/release'
import { listReleases, liveVersion, type Release } from '@/lib/releases'
import {
  deleteReleaseAction,
  saveReleaseAction,
  shipAction,
  unshipAction,
} from '@/app/admin/actions'
import { btn, card, input, section } from './ui'

const PLATFORMS: Platform[] = ['mac', 'win', 'linux']

// How many releases get a binary check. Three HEAD requests each, so the old
// limit of eight was twenty-four round-trips to R2 before this tab could paint
// — and nobody is auditing the artefacts of a release from four versions ago.
const BINARY_CHECK_LIMIT = 3

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

function ReleaseRow({
  release,
  live,
  binaries,
}: {
  release: Release
  live: string
  binaries: Record<Platform, boolean> | undefined
}) {
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
          {binaries
            ? PLATFORMS.map(p => `${p} ${binaries[p] ? '✓' : '✗'}`).join(' · ')
            : 'binaries not checked'}
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

export default async function ReleasesTab() {
  const [releases, live] = await Promise.all([listReleases(), liveVersion()])

  const checked = releases.slice(0, BINARY_CHECK_LIMIT)
  const binaries = Object.fromEntries(
    await Promise.all(checked.map(async r => [r.version, await binaryStatus(r.version)] as const)),
  ) as Record<string, Record<Platform, boolean>>

  return (
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
            <ReleaseRow key={r.version} release={r} live={live} binaries={binaries[r.version]} />
          ))
        )}
      </div>
    </section>
  )
}
