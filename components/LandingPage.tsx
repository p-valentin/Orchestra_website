import Link from 'next/link'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import DownloadCta from '@/components/DownloadCta'
import { faqSchema, jsonLdScript, ORGANIZATION_ID } from '@/lib/schema'
import { SITE_URL } from '@/lib/site'
import type { LandingPage as LandingPageData } from '@/lib/landing'

// One layout for every keyword landing page. The pages differ in content, not
// in shape, and the FAQ block at the bottom is the reason each one carries
// FAQPage structured data — that is the piece Google can turn into a rich
// result, and it costs nothing beyond writing the answers honestly.

export default function LandingPage({ page }: { page: LandingPageData }) {
  const schemas = [
    faqSchema(page.faq),
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: page.h1,
      description: page.description,
      url: `${SITE_URL}/${page.slug}`,
      publisher: { '@id': ORGANIZATION_ID },
    },
  ]

  return (
    <div className="flex min-h-screen flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(schemas) }} />
      <Nav />

      <main className="flex-1">
        <section className="hero-light mx-auto w-full max-w-4xl px-5 pb-16 pt-40 sm:px-8">
          <h1 className="font-display text-4xl font-medium leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            {page.h1}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">{page.lede}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/downloads"
              className="rounded-lg bg-brass px-5 py-2.5 font-semibold text-[#1a1306] transition-colors hover:bg-brass-bright"
            >
              Download free trial
            </Link>
            <Link
              href="/docs/quickstart"
              className="rounded-lg border border-line-strong px-5 py-2.5 font-semibold text-muted transition-colors hover:text-fg"
            >
              Read the quickstart
            </Link>
          </div>
        </section>

        <div className="mx-auto w-full max-w-4xl px-5 pb-20 sm:px-8">
          {page.sections.map(section => (
            <section key={section.heading} className="mt-16 first:mt-0">
              <h2 className="font-display text-2xl font-medium tracking-tight sm:text-3xl">{section.heading}</h2>
              {section.body.map(paragraph => (
                <p key={paragraph.slice(0, 40)} className="mt-4 max-w-2xl leading-relaxed text-muted">
                  {paragraph}
                </p>
              ))}
              {section.bullets && (
                <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                  {section.bullets.map(bullet => (
                    <div key={bullet.term} className="rounded-xl border border-line bg-panel p-4 sm:p-5">
                      <dt className="font-display text-lg font-medium text-fg">{bullet.term}</dt>
                      <dd className="mt-1.5 text-sm leading-relaxed text-muted">{bullet.detail}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          ))}

          <section className="mt-20">
            <h2 className="font-display text-2xl font-medium tracking-tight sm:text-3xl">Common questions</h2>
            <div className="mt-6 divide-y divide-line border-y border-line">
              {page.faq.map(entry => (
                <div key={entry.question} className="py-5">
                  <h3 className="font-display text-lg font-medium text-fg">{entry.question}</h3>
                  <p className="mt-2 max-w-2xl leading-relaxed text-muted">{entry.answer}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-16">
            <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-brass">Keep reading</h2>
            <ul className="mt-4 flex flex-col gap-2">
              {page.related.map(link => (
                <li key={link.href}>
                  <Link href={link.href} className="text-muted underline-offset-4 hover:text-fg hover:underline">
                    {link.label} →
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <DownloadCta />
      </main>

      <Footer />
    </div>
  )
}
