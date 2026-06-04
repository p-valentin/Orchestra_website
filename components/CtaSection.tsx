import BetaSignup from './BetaSignup'

export default function CtaSection() {
  return (
    <section id="download" className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
      <div className="grid items-center gap-12 rounded-3xl border border-subtle bg-surface/60 p-10 sm:p-14 lg:grid-cols-2 lg:gap-0">
        {/* left — download */}
        <div className="lg:pr-14">
          <h2 className="font-display text-5xl font-semibold leading-[0.98] tracking-tight text-text-primary sm:text-6xl">
            Download.
            <br />
            <span className="italic font-medium text-teal">Free beta.</span>
          </h2>
          <a
            href="/downloads"
            className="mt-8 inline-flex items-center gap-2.5 rounded-lg bg-teal px-7 py-3.5 font-semibold text-[#1a1306] transition-transform hover:-translate-y-0.5"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
              <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 19h16" />
            </svg>
            Download now
          </a>
          <BetaSignup />
        </div>

        {/* vertical divider */}
        <div className="hidden lg:block lg:border-l lg:border-subtle lg:pl-14">
          <Service />
        </div>
        <div className="border-t border-subtle pt-10 lg:hidden">
          <Service />
        </div>
      </div>
    </section>
  )
}

function Service() {
  return (
    <>
      <h3 className="font-display text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
        Need it built for you?
      </h3>
      <p className="mt-4 leading-relaxed text-text-secondary">
        I'll build a custom automation for you — from simple login flows to complex 
        multi-step workflows. Built with Orchestra, delivered as code you own.
      </p>
      <a
        href="#contact"
        className="mt-7 inline-flex items-center gap-2 rounded-lg border border-navy px-6 py-3 font-medium text-text-primary transition-colors hover:border-teal hover:text-teal"
      >
        Hire me →
      </a>
    </>
  )
}
