import { VERSION } from '@/lib/release'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import BetaSignup from '@/components/BetaSignup'

type PlatformCardProps = {
  icon: React.ReactNode
  name: string
  note: string
  links: { label: string; href: string }[]
}

function PlatformCard({ icon, name, note, links }: PlatformCardProps) {
  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-subtle bg-surface/60 p-8">
      <div className="flex items-center gap-4">
        <span className="text-teal">{icon}</span>
        <div>
          <div className="font-display text-xl font-semibold text-text-primary">{name}</div>
          <div className="text-sm text-text-secondary">{note}</div>
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        {links.map((link) => (
          <a
            key={link.label}
            href={link.href}
            className="inline-flex items-center gap-2.5 rounded-lg bg-teal px-5 py-3 font-semibold text-[#1a1306] transition-transform hover:-translate-y-0.5"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 19h16" />
            </svg>
            {link.label}
          </a>
        ))}
      </div>
    </div>
  )
}

function MacIcon() {
  return (
    <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" aria-hidden="true">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  )
}

function WindowsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" aria-hidden="true">
      <path d="M3 12V6.75l6-1.32v6.57H3zm17 0V5.25L11 3.5v8.5h9zm-17 1h6v6.43l-6-1.38V13zm17 0v6.75l-9-1.75V13h9z" />
    </svg>
  )
}

function LinuxIcon() {
  return (
    <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" aria-hidden="true">
      <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489.117.779.567 1.563 1.239 2.228l.038.033.033.038c.62.629 1.349 1.209 2.126 1.711 1.604 1.031 2.508 2.19 2.679 3.651-.038.09.005.226.029.313a.618.618 0 00.594.451h1.36c.323 0 .593-.258.594-.579.003-.385.04-.765.155-1.138.22-.72.636-1.319 1.218-1.821l.045-.04.04-.046c.854-1.021 1.551-2.273 1.829-3.653l.016-.073c.064-.33.138-.67.138-1.022 0-1.054-.48-2.125-1.163-3.155-.683-1.03-1.57-1.983-2.398-2.838-1.26-1.308-2.388-2.683-2.463-4.463-.037-.898.244-1.768.764-2.435.458-.593 1.094-.954 1.857-1.054.1-.012.196-.018.287-.018zm-.499 3.547c-.404.015-.744.197-1.003.516-.244.3-.375.693-.355 1.116.04.844.648 1.528 1.359 1.528.058 0 .115-.006.173-.017.376-.065.694-.25.924-.534.236-.293.354-.667.324-1.059-.065-.826-.703-1.536-1.422-1.55zm3.093 2.386c-.379-.003-.727.18-.986.48-.245.285-.376.662-.352 1.056.048.82.653 1.478 1.353 1.478.055 0 .11-.006.165-.016.36-.066.665-.241.888-.515.228-.28.343-.64.315-1.013-.063-.803-.679-1.463-1.383-1.47z" />
    </svg>
  )
}

export default function DownloadsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-32 pt-40 sm:px-8">
        <div className="mb-4 flex items-center gap-3">
          <span className="rounded-full border border-teal/40 bg-teal/10 px-3 py-1 font-mono text-xs text-teal">
            v{VERSION} · Free beta
          </span>
        </div>

        <h1 className="font-display text-5xl font-semibold leading-[0.98] tracking-tight text-text-primary sm:text-6xl">
          Download Orchestra.
        </h1>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <PlatformCard
            icon={<MacIcon />}
            name="macOS"
            note="Apple Silicon"
            links={[{ label: 'Download .dmg', href: '/api/download/mac' }]}
          />
          <PlatformCard
            icon={<WindowsIcon />}
            name="Windows"
            note="x64 · Windows 10+"
            links={[{ label: 'Download .exe', href: '/api/download/win' }]}
          />
          <PlatformCard
            icon={<LinuxIcon />}
            name="Linux"
            note="x64 · AppImage"
            links={[{ label: 'Download .AppImage', href: '/api/download/linux' }]}
          />
        </div>

        <div className="mt-14 max-w-lg">
          <BetaSignup />
        </div>
      </main>
      <Footer />
    </div>
  )
}
