import ProductShot from './ProductShot'

const STATS = [
  { value: '40+', label: 'instruments' },
  { value: '100%', label: 'your code' },
  { value: '0', label: 'lock-in' },
]

export default function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pt-32 sm:pt-40">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 sm:px-8 lg:grid-cols-[1.02fr_0.98fr] lg:gap-10 lg:pb-28">
        <div>
          <div className="mb-8 flex items-center gap-3.5">
            <span className="h-px w-9 bg-teal/60" />
            <span className="text-xs uppercase tracking-[0.26em] text-teal">
              Browser automation, conducted
            </span>
          </div>

          <h1 className="font-display text-6xl font-semibold leading-[0.95] tracking-tight text-text-primary sm:text-7xl lg:text-[5.25rem]">
            You conduct.
            <span className="block italic font-medium text-teal">It plays.</span>
          </h1>

          <p className="mt-8 max-w-md text-lg leading-relaxed text-text-secondary">
            Orchestra turns repetitive browser work into a score you arrange by hand — every step
            visible, every line of Playwright yours to keep.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-4">
            <a
              href="/downloads/Orchestra-0.1.0-beta.arm64.dmg"
              download
              className="inline-flex items-center gap-2.5 rounded-lg bg-teal px-7 py-3.5 font-semibold text-[#1a1306] transition-transform hover:-translate-y-0.5"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
                <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 19h16" />
              </svg>
              Download now
            </a>
            <a
              href="#contact"
              className="border-b border-navy pb-1 font-medium text-text-primary transition-colors hover:border-teal hover:text-teal"
            >
              Need it built? →
            </a>
          </div>

          <dl className="mt-12 flex gap-9">
            {STATS.map((stat) => (
              <div key={stat.label}>
                <dt className="font-display text-3xl font-semibold tracking-tight text-text-primary">
                  {stat.value}
                </dt>
                <dd className="mt-1 text-xs uppercase tracking-wider text-text-secondary">
                  {stat.label}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="lg:pl-4">
          <ProductShot
            src="/shots/app.png"
            alt="The Orchestra app: a visual flow of Navigate, Extract and Output steps driving a live web page, with the scraped result in the console."
            width={1778}
            height={765}
            priority
            sizes="(max-width: 1024px) 100vw, 620px"
            frameClassName="w-full"
            imgClassName="h-auto w-full"
          />
        </div>
      </div>
    </section>
  )
}
