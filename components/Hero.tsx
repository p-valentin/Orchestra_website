import FlowDemo from './FlowDemo'

const TRUST = ['Runs on your machine', 'No account needed', 'Exports plain Playwright', 'Free to use']

export default function Hero() {
  return (
    <section id="top" className="hero-light relative pt-32 sm:pt-40">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 pb-16 sm:px-8 lg:grid-cols-[1fr_1fr] lg:gap-12 lg:pb-24">
        <div>
          <h1 className="font-display text-5xl font-medium leading-[1.02] tracking-tight sm:text-6xl lg:text-[4.4rem]">
            Automate any website.
            <span className="block text-brass">Keep the code.</span>
          </h1>

          <p className="mt-7 max-w-lg text-lg leading-relaxed text-muted">
            Orchestra is a desktop studio for browser automation. Build your flow from visual steps,
            watch it run live in a real browser, and export plain Playwright that runs anywhere.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-4">
            <a
              href="/downloads"
              className="inline-flex items-center gap-2.5 rounded-lg bg-brass px-7 py-3.5 font-semibold text-[#1a1306] transition-colors hover:bg-brass-bright"
            >
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 19h16" />
              </svg>
              Download for desktop
            </a>
            <a
              href="#how"
              className="inline-flex items-center gap-2 rounded-lg border border-line-strong px-6 py-3.5 font-medium text-fg transition-colors hover:border-brass/60 hover:text-brass-bright"
            >
              See how it works
            </a>
          </div>

          <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2">
            {TRUST.map((item) => (
              <li key={item} className="flex items-center gap-2 text-[13px] text-muted">
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="#d9b36a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2.5 8.5l3.5 3.5L13.5 4" />
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="lg:pl-2">
          <FlowDemo />
          <p className="mt-3.5 text-center font-mono text-xs text-faint">
            A real Orchestra flow: scrape a bookstore into a CSV — six steps, zero code.
          </p>
        </div>
      </div>
    </section>
  )
}
