import LogoMark from './LogoMark'

export default function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-3 md:items-start">
        <div>
          <a href="#top" className="flex items-center gap-2.5" aria-label="Orchestra home">
            <LogoMark size={30} className="h-8 w-8" />
            <span className="font-display text-xl font-semibold tracking-tight">Orchestra</span>
          </a>
          <p className="mt-3 font-display text-lg italic tracking-tight text-brass">
            You conduct. It plays.
          </p>
        </div>

        <nav className="flex flex-col gap-2.5 md:items-center" aria-label="Footer">
          <a href="/#how" className="text-sm text-muted transition-colors hover:text-fg">How it works</a>
          <a href="/#features" className="text-sm text-muted transition-colors hover:text-fg">Features</a>
          <a href="/downloads" className="text-sm text-muted transition-colors hover:text-fg">Download</a>
          <a href="/docs" className="text-sm text-muted transition-colors hover:text-fg">Docs</a>
          <a href="/blog" className="text-sm text-muted transition-colors hover:text-fg">Blog</a>
          <a href="/releases" className="text-sm text-muted transition-colors hover:text-fg">Releases</a>
          <a href="/#contact" className="text-sm text-muted transition-colors hover:text-fg">Contact</a>
        </nav>

        <div className="md:text-right">
          <p className="text-sm text-muted">© 2026 Orchestra</p>
          <p className="mt-1 text-sm text-muted">orchestra-automation.com</p>
          <a
            href="mailto:hello@orchestra-automation.com"
            className="mt-1 block text-sm text-muted transition-colors hover:text-fg"
          >
            hello@orchestra-automation.com
          </a>
          <p className="mt-3 text-sm">
            <a href="/privacy" className="text-muted transition-colors hover:text-fg">Privacy</a>
            <span className="mx-2 text-faint">·</span>
            <a href="/eula" className="text-muted transition-colors hover:text-fg">EULA</a>
            <span className="mx-2 text-faint">·</span>
            <a href="/refunds" className="text-muted transition-colors hover:text-fg">Refunds</a>
            <span className="mx-2 text-faint">·</span>
            <a href="/acceptable-use" className="text-muted transition-colors hover:text-fg">Acceptable Use</a>
          </p>
        </div>
      </div>
    </footer>
  )
}
