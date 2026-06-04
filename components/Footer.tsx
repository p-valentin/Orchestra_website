import LogoMark from './LogoMark'

export default function Footer() {
  return (
    <footer className="border-t border-subtle">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-3 md:items-start">
        {/* brand */}
        <div>
          <a href="#top" className="flex items-center gap-2.5" aria-label="Orchestra home">
            <LogoMark size={30} className="h-8 w-8" />
            <span className="font-display text-xl font-semibold tracking-tight text-text-primary">Orchestra</span>
          </a>
          <p className="mt-3 font-display text-lg italic tracking-tight text-teal">You conduct. It plays.</p>
        </div>

        {/* nav */}
        <nav className="flex flex-col gap-2.5 md:items-center" aria-label="Footer">
          <a href="#features" className="text-sm text-text-secondary transition-colors hover:text-text-primary">Features</a>
          <a href="#" className="text-sm text-text-secondary transition-colors hover:text-text-primary">Pricing</a>
          <a href="#download" className="text-sm text-text-secondary transition-colors hover:text-text-primary">Download</a>
          <a href="#contact" className="text-sm text-text-secondary transition-colors hover:text-text-primary">Contact</a>
        </nav>

        {/* legal */}
        <div className="md:text-right">
          <p className="text-sm text-text-secondary">© 2026 Orchestra</p>
          <p className="mt-1 text-sm text-text-secondary">orchestra-automation.com</p>
          <a
            href="mailto:hello@orchestra-automation.com"
            className="mt-1 block text-sm text-text-secondary transition-colors hover:text-text-primary"
          >
            hello@orchestra-automation.com
          </a>
        </div>
      </div>
    </footer>
  )
}
