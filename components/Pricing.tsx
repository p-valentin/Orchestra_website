// Pricing: one trial, one price. The buy button always renders; it opens the
// Paddle overlay checkout once NEXT_PUBLIC_PADDLE_* are set, and shows as
// disabled with the "opens at launch" hint before then (see components/BuyButton).

import { PADDLE_CONFIGURED } from '@/lib/paddle'
import BuyButton from '@/components/BuyButton'

const TRIAL_POINTS = [
  'Every feature unlocked',
  'No card required',
  'Starts the first time you sign in inside the app',
  'Flows you build are yours to keep either way',
]

const LIFETIME_POINTS = [
  'Everything in the trial, forever',
  'Use it on 3 devices — move them whenever you like',
  'Free updates for as long as Orchestra is sold',
  'Runs offline for up to 7 days between check-ins',
  'Exports plain Playwright code you own outright',
]

function Points({ items }: { items: string[] }) {
  return (
    <ul className="mt-6 flex flex-col gap-2.5 text-[15px] text-muted">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3">
          <svg className="mt-1.5 shrink-0" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="#d9b36a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2.5 8.5l3.5 3.5L13.5 4" />
          </svg>
          {item}
        </li>
      ))}
    </ul>
  )
}

export default function Pricing() {
  return (
    <section id="pricing" className="border-t border-line">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-24">
        <p className="text-center font-mono text-xs uppercase tracking-[0.18em] text-brass">Pricing</p>
        <h2 className="mt-4 text-center font-display text-4xl font-medium leading-[1.05] tracking-tight sm:text-5xl">
          Try everything free.
          <span className="block text-brass">Keep it with one payment.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-center leading-relaxed text-muted">
          No subscription, no per-run fees. Fourteen days to see if Orchestra earns its keep, then a
          single purchase that covers every update after it.
        </p>

        <div className="mx-auto mt-12 grid max-w-4xl gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-line bg-panel p-8 sm:p-10">
            <h3 className="font-display text-2xl font-medium tracking-tight">Free trial</h3>
            <p className="mt-3 flex items-baseline gap-2">
              <span className="font-display text-5xl font-medium">$0</span>
              <span className="text-muted">for 14 days</span>
            </p>
            <Points items={TRIAL_POINTS} />
            <a
              href="/downloads"
              className="mt-8 inline-flex items-center gap-2 rounded-lg border border-brass/50 px-6 py-3 font-medium text-brass-bright transition-colors hover:bg-brass hover:text-[#1a1306]"
            >
              Download and start
            </a>
          </div>

          <div className="rounded-xl border border-brass/40 bg-panel p-8 sm:p-10">
            <h3 className="font-display text-2xl font-medium tracking-tight">Lifetime</h3>
            <p className="mt-3 flex items-baseline gap-2">
              <span className="font-display text-5xl font-medium">$129</span>
              <span className="text-muted">once, forever</span>
            </p>
            <Points items={LIFETIME_POINTS} />
            <BuyButton className="mt-8 inline-flex items-center gap-2 rounded-lg bg-brass px-6 py-3 font-semibold text-[#1a1306] transition-colors hover:bg-brass-bright">
              Buy Orchestra — $129
            </BuyButton>
            {!PADDLE_CONFIGURED && (
              <p className="mt-3 text-xs text-faint">Checkout opens at launch.</p>
            )}
          </div>
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-muted">
          Your account is your license — buy with the same email you signed up with and it attaches
          automatically, nothing to paste. Shown in USD; at checkout Paddle (our merchant of record)
          charges in your local currency and handles any tax. Claimed a free license during the
          beta? That promise stands — yours stays free, forever.
        </p>
      </div>
    </section>
  )
}
