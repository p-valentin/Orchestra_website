'use client'

import { useEffect, useRef, useState } from 'react'

type Step = {
  label: string
  detail: string
  ms: number
  wait: number
  indent?: boolean
  console?: string
}

const STEPS: Step[] = [
  { label: 'Navigate', detail: 'books.toscrape.com', ms: 412, wait: 1100, console: '→ 200 OK · books.toscrape.com' },
  { label: 'Extract List', detail: '.product_pod → $books', ms: 96, wait: 900, console: '$books = [ …20 items ]' },
  { label: 'Each', detail: '$books as $book', ms: 8, wait: 700 },
  { label: 'Extract', detail: 'h3 a → $title', ms: 31, wait: 800, indent: true, console: '$title = "A Light in the Attic"' },
  { label: 'Extract', detail: '.price_color → $price', ms: 27, wait: 800, indent: true, console: '$price = "£51.77"' },
  { label: 'Output', detail: '$books → books.csv', ms: 44, wait: 1000, console: '✓ wrote 20 rows → data/books.csv' },
]

const DONE_PAUSE = 3200

export default function FlowDemo() {
  const [active, setActive] = useState(-1)
  const [reduced, setReduced] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (reduced) return
    if (active === -1) {
      timer.current = setTimeout(() => setActive(0), 600)
    } else if (active < STEPS.length) {
      timer.current = setTimeout(() => setActive(active + 1), STEPS[active]!.wait)
    } else {
      timer.current = setTimeout(() => setActive(-1), DONE_PAUSE)
    }
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [active, reduced])

  const shown = reduced ? STEPS.length : active
  const done = shown >= STEPS.length
  const consoleLines = STEPS.filter((s, i) => s.console && i < shown).map((s) => s.console!)

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-panel shadow-2xl shadow-black/60">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#3a352b]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#3a352b]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#3a352b]" />
        <span className="ml-3 font-mono text-[11px] text-muted">books-to-csv.orchestra</span>
        <span
          className={`ml-auto font-mono text-[10px] uppercase tracking-wider ${
            done ? 'text-ok' : shown >= 0 ? 'text-brass' : 'text-faint'
          }`}
        >
          {done ? '✓ finished' : shown >= 0 ? '● running' : 'ready'}
        </span>
      </div>

      <div className="flex flex-col gap-1 px-4 py-4">
        {STEPS.map((step, i) => {
          const state = i < shown ? 'done' : i === shown ? 'running' : 'pending'
          return (
            <div
              key={i}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-300 ${
                step.indent ? 'ml-7' : ''
              } ${
                state === 'running'
                  ? 'bg-brass/10'
                  : state === 'done'
                    ? 'bg-transparent'
                    : 'opacity-40'
              }`}
            >
              <span className="flex h-4 w-4 items-center justify-center">
                {state === 'done' ? (
                  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="#7fc97f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2.5 8.5l3.5 3.5L13.5 4" />
                  </svg>
                ) : state === 'running' ? (
                  <span className="step-spinner" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-faint" />
                )}
              </span>
              <span className={`font-medium ${state === 'running' ? 'text-brass-bright' : 'text-fg'}`}>
                {step.label}
              </span>
              <span className="truncate font-mono text-xs text-muted">{step.detail}</span>
              <span className="ml-auto font-mono text-[11px] text-faint">
                {state === 'done' ? `${step.ms}ms` : ''}
              </span>
            </div>
          )
        })}
      </div>

      <div className="border-t border-line bg-well px-4 py-3">
        <div className="flex min-h-[5.5rem] flex-col gap-1 font-mono text-[11px] leading-relaxed">
          {consoleLines.length === 0 && <span className="text-faint">console — waiting for run…</span>}
          {consoleLines.map((line, i) => (
            <span key={i} className={line.startsWith('✓') ? 'text-ok' : 'text-muted'}>
              {line}
            </span>
          ))}
          {done && <span className="text-brass">run finished in 0.6s · flow exported as books-to-csv.js</span>}
        </div>
      </div>
    </div>
  )
}
