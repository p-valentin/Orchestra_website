import { getLicenseStatus } from '@/lib/licenses'
import BetaSignup from './BetaSignup'
import DownloadButton from './DownloadButton'
import LicenseCounter from './LicenseCounter'

export default async function DownloadCta() {
  const { total, remaining } = await getLicenseStatus()
  return (
    <section id="download" className="border-t border-line bg-panel/40">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-24">
        <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <h2 className="font-display text-4xl font-medium leading-[1.05] tracking-tight sm:text-5xl">
              Free while in beta.
              <span className="block text-brass">Free for you, forever.</span>
            </h2>
            <p className="mt-5 max-w-md leading-relaxed text-muted">
              Download Orchestra, claim your beta license with just an email, and it stays free for
              you when paid plans arrive. No card, no account.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <DownloadButton platform="mac" arch="arm64" label="macOS" />
              <DownloadButton platform="win" arch="x64" label="Windows" />
              <DownloadButton platform="linux" arch="x64" label="Linux" />
            </div>

            <div className="mt-6">
              <LicenseCounter remaining={remaining} total={total} />
            </div>

            <BetaSignup remaining={remaining} />
          </div>

          <div className="rounded-xl border border-line bg-panel p-8 sm:p-10">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-brass">Done-for-you</p>
            <h3 className="mt-4 font-display text-3xl font-medium tracking-tight">
              Don’t want to build it yourself?
            </h3>
            <p className="mt-4 leading-relaxed text-muted">
              I build custom automations on request — from a simple login-and-download routine to
              multi-step scraping pipelines. Delivered as Orchestra flows <em>and</em> standalone
              code you own outright, with no ongoing fees.
            </p>
            <ul className="mt-6 flex flex-col gap-2.5 text-[15px] text-muted">
              <li className="flex items-center gap-3">
                <span className="h-1 w-1 rounded-full bg-brass" /> Fixed quote up front, typically 2–5 days
              </li>
              <li className="flex items-center gap-3">
                <span className="h-1 w-1 rounded-full bg-brass" /> You get the flow, the code, and a walkthrough
              </li>
              <li className="flex items-center gap-3">
                <span className="h-1 w-1 rounded-full bg-brass" /> Optional care plan when sites change
              </li>
            </ul>
            <a
              href="#contact"
              className="mt-8 inline-flex items-center gap-2 rounded-lg border border-brass/50 px-6 py-3 font-medium text-brass-bright transition-colors hover:bg-brass hover:text-[#1a1306]"
            >
              Request a quote
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
