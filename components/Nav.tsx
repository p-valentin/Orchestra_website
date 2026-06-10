'use client'

import { useEffect, useState } from 'react'
import LogoMark from './LogoMark'

const LINKS = [
  { href: '/#how', label: 'How it works' },
  { href: '/#features', label: 'Features' },
  { href: '/#uses', label: 'Use cases' },
  { href: '/#contact', label: 'Contact' },
]

export default function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        open
          ? 'bg-bg'
          : scrolled
            ? 'border-b border-line bg-bg/80 backdrop-blur-md'
            : 'border-b border-transparent'
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8">
        <a href="/" className="flex items-center gap-2.5" aria-label="Orchestra home">
          <LogoMark size={34} className="h-8 w-8" />
          <span className="font-display text-xl font-semibold tracking-tight">Orchestra</span>
        </a>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
          {LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-sm text-muted transition-colors hover:text-fg"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <a
          href="/downloads"
          className="hidden rounded-lg bg-brass px-5 py-2 text-sm font-semibold text-[#1a1306] transition-colors hover:bg-brass-bright md:inline-block"
        >
          Download free
        </a>

        <button
          className="flex h-10 w-10 items-center justify-center md:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="relative block h-4 w-6">
            <span className={`absolute left-0 block h-0.5 w-6 bg-fg transition-all ${open ? 'top-1.5 rotate-45' : 'top-0'}`} />
            <span className={`absolute left-0 top-1.5 block h-0.5 w-6 bg-fg transition-opacity ${open ? 'opacity-0' : 'opacity-100'}`} />
            <span className={`absolute left-0 block h-0.5 w-6 bg-fg transition-all ${open ? 'top-1.5 -rotate-45' : 'top-3'}`} />
          </span>
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 top-[61px] z-40 flex flex-col gap-1 bg-bg px-6 py-8 md:hidden">
          {LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              onClick={() => setOpen(false)}
              className="border-b border-line py-4 font-display text-2xl font-medium tracking-tight"
            >
              {link.label}
            </a>
          ))}
          <a
            href="/downloads"
            onClick={() => setOpen(false)}
            className="mt-5 rounded-lg bg-brass px-5 py-3 text-center font-semibold text-[#1a1306]"
          >
            Download free
          </a>
        </div>
      )}
    </header>
  )
}
