'use client'

import { useState } from 'react'
import type { FeedbackEntry } from '@/lib/feedback'
import { deleteFeedbackAction } from '@/app/admin/actions'

const KIND_CHIP: Record<string, string> = {
  bug: 'bg-[#e06c63]/15 text-[#f0a8a2]',
  feature: 'bg-brass/15 text-brass',
  testimonial: 'bg-ok/15 text-ok',
  other: 'bg-well text-faint',
}

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'testimonial', label: 'Testimonials' },
  { id: 'bug', label: 'Bug' },
  { id: 'feature', label: 'Feature' },
  { id: 'other', label: 'Other' },
] as const

type TabId = (typeof TABS)[number]['id']

export default function FeedbackPanel({ entries }: { entries: FeedbackEntry[] }) {
  const [tab, setTab] = useState<TabId>('all')

  const counts: Record<string, number> = {}
  for (const e of entries) counts[e.kind] = (counts[e.kind] || 0) + 1

  const shown = (tab === 'all' ? entries : entries.filter(e => e.kind === tab)).slice().reverse()

  return (
    <div className="rounded-xl border border-line bg-panel p-5">
      <div className="flex flex-wrap gap-1.5 border-b border-line pb-3">
        {TABS.map(t => {
          const n = t.id === 'all' ? entries.length : (counts[t.id] || 0)
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-md px-3 py-1 font-mono text-xs transition-colors ${active ? 'bg-brass text-[#1a1306]' : 'text-muted hover:bg-well hover:text-fg'}`}
            >
              {t.label} <span className={active ? 'text-[#1a1306]/70' : 'text-faint'}>{n}</span>
            </button>
          )
        })}
      </div>

      {shown.length === 0 ? (
        <p className="pt-4 text-sm text-faint">Nothing here yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map(f => (
            <li key={f.id} className="py-3 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 font-mono text-[11px] ${KIND_CHIP[f.kind] ?? KIND_CHIP.other}`}>{f.kind}</span>
                <span className="text-sm text-fg">{f.name || 'anonymous'}</span>
                {f.email && <span className="font-mono text-xs text-faint">{f.email}</span>}
                {f.handle && <span className="font-mono text-xs text-faint">{f.handle}</span>}
                <div className="ml-auto flex items-center gap-2">
                  <span className="font-mono text-xs text-faint">{f.at.slice(0, 10)}</span>
                  <form action={deleteFeedbackAction}>
                    <input type="hidden" name="id" value={f.id} />
                    <button className="rounded-md border border-line px-2 py-0.5 font-mono text-[11px] text-faint transition-colors hover:border-[#e06c63]/60 hover:text-[#f0a8a2]">
                      delete
                    </button>
                  </form>
                </div>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted">{f.message}</p>
              {f.meta?.version && (
                <p className="mt-1 font-mono text-[11px] text-faint">v{f.meta.version} · {f.meta.platform} {f.meta.arch}</p>
              )}
              {f.logs && (
                <details className="mt-1">
                  <summary className="cursor-pointer font-mono text-xs text-faint hover:text-muted">logs</summary>
                  <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded border border-line bg-well p-2 text-[11px] text-muted">{f.logs}</pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
