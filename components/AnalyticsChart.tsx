'use client'

import { useState } from 'react'

// Daily/hourly views and downloads as two small multiples sharing an x-axis
// and one scrubber. Touch-first: drag or tap anywhere on a chart (or use
// arrow keys) to pin a point — its numbers show in the readout row, never
// only in a hover tooltip. Series colors are CVD-validated against the panel
// surface; each chart holds a single titled series, so identity never rides
// on color.

export interface DayPoint {
  day: string // YYYY-MM-DD
  views: number
  downloads: number
}

export interface HourPoint {
  hour: string // YYYY-MM-DDTHH (UTC)
  views: number
  downloads: number
}

export interface DauPoint {
  day: string // YYYY-MM-DD
  active: number
}

interface Point {
  key: string
  views: number
  downloads: number
  active: number
}

type RangeId = '24h' | '7d' | '14d' | '30d' | '90d'
const RANGES: RangeId[] = ['24h', '7d', '14d', '30d', '90d']

const SERIES = {
  views: { label: 'Views', color: '#b08a3f' },
  downloads: { label: 'Downloads', color: '#4a90c9' },
  active: { label: 'Active devices', color: '#6cb079' },
} as const

function fmtHourLong(key: string): string {
  const d = new Date(`${key}:00:00Z`)
  return `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}`
}

function fmtHourShort(key: string): string {
  return new Date(`${key}:00:00Z`).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
}

function fmtDayLong(key: string): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

function fmtDayShort(key: string): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function Key({ color }: { color: string }) {
  return <span aria-hidden className="inline-block h-[3px] w-3 rounded-full align-middle" style={{ backgroundColor: color }} />
}

function MiniChart({
  points, metric, unit, selected, onScrub,
}: {
  points: Point[]
  metric: keyof typeof SERIES
  unit: string
  selected: number
  onScrub: (index: number) => void
}) {
  const { label, color } = SERIES[metric]
  const values = points.map(p => p[metric])
  const max = Math.max(1, ...values)
  const total = values.reduce((sum, v) => sum + v, 0)

  const pick = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const idx = Math.floor(((e.clientX - rect.left) / rect.width) * points.length)
    onScrub(Math.min(points.length - 1, Math.max(0, idx)))
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
          <Key color={color} /> {label}
        </p>
        <p className="font-mono text-[11px] text-faint">{total} total · peak {max}/{unit}</p>
      </div>
      <div
        className="mt-2 flex h-20 cursor-crosshair items-end border-b border-line"
        style={{ touchAction: 'pan-y' }}
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); pick(e) }}
        onPointerMove={e => { if (e.buttons > 0 || e.pointerType === 'mouse') pick(e) }}
      >
        {points.map((p, i) => {
          const value = p[metric]
          const isSel = i === selected
          return (
            <div
              key={p.key}
              className="flex h-full flex-1 items-end justify-center px-px"
              style={isSel ? { backgroundColor: 'rgba(243,238,226,0.08)' } : undefined}
            >
              <div
                className={`w-full max-w-6 ${points.length > 45 ? 'rounded-t-[2px]' : 'rounded-t'}`}
                style={{
                  height: value === 0 ? 0 : `${Math.max(4, Math.round((value / max) * 100))}%`,
                  backgroundColor: color,
                  filter: isSel ? 'brightness(1.45)' : undefined,
                }}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function AnalyticsChart({
  days,
  hours,
  dau = [],
}: {
  days: DayPoint[]
  hours: HourPoint[]
  dau?: DauPoint[]
}) {
  const [range, setRange] = useState<RangeId>('30d')
  const hourly = range === '24h'
  const activeByDay = new Map(dau.map(d => [d.day, d.active]))
  const points: Point[] = hourly
    ? hours.slice(-24).map(h => ({ key: h.hour, views: h.views, downloads: h.downloads, active: 0 }))
    : days.slice(-parseInt(range)).map(d => ({
      key: d.day,
      views: d.views,
      downloads: d.downloads,
      active: activeByDay.get(d.day) ?? 0,
    }))
  // Device check-ins are a daily rollup, so there is nothing to plot against an
  // hourly axis — and no history at all until the entitlement function has been
  // writing them for a day.
  const showDau = !hourly && dau.length > 0
  // Selection is stored from the end so switching range keeps the same moment.
  const [fromEnd, setFromEnd] = useState(1)
  const selected = points.length - Math.min(fromEnd, points.length)
  const sel = points[selected]!
  const fmtLong = hourly ? fmtHourLong : fmtDayLong
  const fmtShort = hourly ? fmtHourShort : fmtDayShort
  const empty = hourly && points.every(p => p.views === 0 && p.downloads === 0)

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const next = e.key === 'ArrowLeft' ? fromEnd + 1 : fromEnd - 1
      setFromEnd(Math.min(points.length, Math.max(1, next)))
    }
  }

  const xLabels = [points[0], points[Math.floor((points.length - 1) / 2)], points[points.length - 1]]

  return (
    <div
      role="group"
      aria-label={`Views and downloads, last ${range}. Use left and right arrow keys to inspect ${hourly ? 'hours' : 'days'}.`}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="rounded-xl border border-line bg-panel p-4 outline-none focus-visible:border-brass/60 sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h3 className="font-display text-lg font-medium">Activity</h3>
        <div className="flex gap-1.5" role="radiogroup" aria-label="Date range">
          {RANGES.map(r => (
            <button
              key={r}
              role="radio"
              aria-checked={range === r}
              onClick={() => setRange(r)}
              className={`rounded-md px-2.5 py-0.5 font-mono text-xs transition-colors ${
                range === r ? 'bg-brass text-[#1a1306]' : 'text-muted hover:bg-well hover:text-fg'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <p className="ml-auto font-mono text-xs text-muted" aria-live="polite">
          <span className="text-fg">{fmtLong(sel.key)}</span>
          <span className="mx-2 text-faint">·</span>
          <Key color={SERIES.views.color} /> <span className="font-semibold text-fg">{sel.views}</span> views
          <span className="mx-2 text-faint">·</span>
          <Key color={SERIES.downloads.color} /> <span className="font-semibold text-fg">{sel.downloads}</span> downloads
          {showDau && (
            <>
              <span className="mx-2 text-faint">·</span>
              <Key color={SERIES.active.color} /> <span className="font-semibold text-fg">{sel.active}</span> active
            </>
          )}
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        <MiniChart points={points} metric="views" unit={hourly ? 'hr' : 'day'} selected={selected} onScrub={i => setFromEnd(points.length - i)} />
        <MiniChart points={points} metric="downloads" unit={hourly ? 'hr' : 'day'} selected={selected} onScrub={i => setFromEnd(points.length - i)} />
        {showDau && (
          <MiniChart points={points} metric="active" unit="day" selected={selected} onScrub={i => setFromEnd(points.length - i)} />
        )}
      </div>

      <div className="mt-1.5 flex justify-between font-mono text-[11px] text-faint" aria-hidden>
        {xLabels.map((p, i) => <span key={i}>{p ? fmtShort(p.key) : ''}</span>)}
      </div>
      <p className="mt-3 text-xs text-faint">
        {empty
          ? 'No hourly data yet — hourly tracking starts with this deploy and covers the last 24h.'
          : 'Tap, drag or use ←/→ to inspect a point.'}
      </p>
    </div>
  )
}
