'use client'

import { useEffect, useState } from 'react'
import LogoMark from './LogoMark'

const LINKS = [
  { href: '/#features', label: 'Features' },
  { href: '/#download', label: 'Pricing' },
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
          ? 'bg-[#0b0a08]'
          : scrolled
            ? 'border-b border-subtle bg-bg/70 backdrop-blur-md'
            : 'border-b border-transparent'
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <a href="#top" className="flex items-center gap-2.5" aria-label="Orchestra home">
          <LogoMark size={38} priority className="h-9 w-9" />
          <span className="font-display text-2xl font-semibold tracking-tight text-text-primary">Orchestra</span>
        </a>

        <nav className="hidden items-center gap-9 md:flex" aria-label="Primary">
          {LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <a
          href="#download"
          className="hidden rounded-full bg-teal px-5 py-2 text-sm font-bold text-bg transition-transform hover:-translate-y-0.5 md:inline-block"
        >
          Download beta
        </a>

        <button
          className="flex h-10 w-10 items-center justify-center md:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="relative block h-4 w-6">
            <span
              className={`absolute left-0 block h-0.5 w-6 bg-text-primary transition-all ${
                open ? 'top-1.5 rotate-45' : 'top-0'
              }`}
            />
            <span
              className={`absolute left-0 top-1.5 block h-0.5 w-6 bg-text-primary transition-opacity ${
                open ? 'opacity-0' : 'opacity-100'
              }`}
            />
            <span
              className={`absolute left-0 block h-0.5 w-6 bg-text-primary transition-all ${
                open ? 'top-1.5 -rotate-45' : 'top-3'
              }`}
            />
          </span>
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 top-[65px] z-40 flex flex-col gap-2 bg-[#0b0a08] px-6 py-8 md:hidden">
          {LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              onClick={() => setOpen(false)}
              className="border-b border-subtle py-4 font-display text-3xl font-medium tracking-tight text-text-primary"
            >
              {link.label}
            </a>
          ))}
          <a
            href="#download"
            onClick={() => setOpen(false)}
            className="mt-4 rounded-full bg-teal px-5 py-3 text-center text-base font-bold text-bg"
          >
            Download beta
          </a>
        </div>
      )}
    </header>
  )
}
