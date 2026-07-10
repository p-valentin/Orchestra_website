'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

// Receives precomputed hrefs from the server layout — this file must never
// value-import lib/docs.ts (it reads the filesystem).

export interface SidebarLink {
  href: string
  label: string
}

export interface SidebarSection {
  label: string
  items: SidebarLink[]
}

export default function DocsSidebar({ sections }: { sections: SidebarSection[] }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // The docs layout persists across client navigations; close the mobile
  // panel whenever the route changes.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  const current = sections.flatMap(s => s.items).find(item => item.href === pathname)

  return (
    <aside className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto lg:pb-4">
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 rounded-lg border border-line bg-panel px-4 py-3 text-left lg:hidden"
      >
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-brass">Docs menu</span>
        <span className="truncate text-sm text-muted">
          {current?.label ?? 'Browse'} {open ? '−' : '+'}
        </span>
      </button>

      <nav aria-label="Docs" className={`${open ? 'mt-4 block' : 'hidden'} lg:mt-0 lg:block`}>
        <div className="flex flex-col gap-7">
          {sections.map(section => (
            <div key={section.label}>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-brass">{section.label}</p>
              <ul className="mt-2.5 flex flex-col gap-0.5">
                {section.items.map(item => {
                  const active = item.href === pathname
                  return (
                    <li key={item.href}>
                      <a
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={`block border-l-2 py-1 pl-3 text-sm transition-colors ${
                          active
                            ? 'border-brass text-fg'
                            : 'border-transparent text-muted hover:border-line-strong hover:text-fg'
                        }`}
                      >
                        {item.label}
                      </a>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>
    </aside>
  )
}
