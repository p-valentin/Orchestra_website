// Shared chrome for the admin tabs.
//
// These class strings used to live as consts at the top of app/admin/page.tsx,
// which was fine while every section rendered from that one file. The tabs are
// now separate components that load independently, so the styles have to be
// somewhere they can all reach — and having one definition is what stops the
// Releases table from slowly drifting away from the Blog one.

export const card = 'rounded-xl border border-line bg-panel p-4 sm:p-5'
export const th = 'pb-2 text-left font-mono text-[11px] uppercase tracking-wider text-faint'
export const td = 'border-t border-line py-1.5 pr-4 text-sm text-muted'
export const num = 'border-t border-line py-1.5 text-right font-mono text-sm text-fg'
export const btn = 'rounded-md px-3 py-1.5 text-sm font-semibold transition-colors'
export const input =
  'rounded-lg border border-line-strong bg-well px-3 py-2 font-mono text-sm text-fg outline-none focus:border-brass'
export const section = 'mt-8'

export function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

export function StatTable({ title, rows, label }: { title: string; rows: [string, number][]; label: string }) {
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

export interface Tile {
  label: string
  value: string | number
  sub: string
  subCls: string
}

export function TileGrid({ heading, tiles }: { heading: string; tiles: Tile[] }) {
  return (
    <div className="mt-6 first:mt-4">
      <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-brass">{heading}</h3>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {tiles.map(tile => (
          <div key={tile.label} className={card}>
            <p className="font-mono text-[11px] uppercase tracking-wider text-faint">{tile.label}</p>
            <p className="mt-1 font-display text-2xl text-fg sm:text-3xl">{tile.value}</p>
            <p className={`mt-0.5 font-mono text-[11px] ${tile.subCls}`}>{tile.sub}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// Period-over-period delta for a stat tile: signed, against the named prior
// window, coloured by direction (more views/downloads is always good here).
export function withTrend(current: number, previous: number, period: string): { sub: string; subCls: string } {
  if (previous === 0 && current === 0) return { sub: `no change vs prior ${period}`, subCls: 'text-faint' }
  if (previous === 0) return { sub: `▲ new vs prior ${period} (0)`, subCls: 'text-ok' }
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct > 0) return { sub: `▲ ${pct}% vs prior ${period}`, subCls: 'text-ok' }
  if (pct < 0) return { sub: `▼ ${Math.abs(pct)}% vs prior ${period}`, subCls: 'text-[#f0a8a2]' }
  return { sub: `flat vs prior ${period}`, subCls: 'text-faint' }
}

// What a tab shows while its data is in flight. The point of the skeleton is
// that the header, the tab bar and the layout are already on screen and stay
// put — the page stops being a blank wait for the slowest read on it.
export function TabSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className={`${section} animate-pulse`} aria-busy="true" aria-label="Loading">
      <div className="h-7 w-48 rounded bg-well" />
      <div className="mt-4 grid gap-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-line bg-panel" />
        ))}
      </div>
    </div>
  )
}
