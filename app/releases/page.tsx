import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import ReleaseNotes from '@/components/ReleaseNotes'
import { publishedReleases } from '@/lib/releases'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Release notes — Orchestra',
  description: 'What changed in each Orchestra release.',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default async function ReleasesPage() {
  const releases = await publishedReleases()

  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      <main className="hero-light mx-auto w-full max-w-3xl flex-1 px-5 pb-32 pt-40 sm:px-8">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-brass">Release notes</p>
        <h1 className="mt-4 font-display text-5xl font-medium leading-[1.0] tracking-tight sm:text-6xl">
          What&apos;s new.
        </h1>

        {releases.length === 0 ? (
          <p className="mt-10 text-muted">Release notes will appear here with the next update.</p>
        ) : (
          <div className="mt-14 flex flex-col gap-12">
            {releases.map(release => (
              <article key={release.version} className="rounded-xl border border-line bg-panel p-7 sm:p-9">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <h2 className="font-display text-3xl font-medium tracking-tight">v{release.version}</h2>
                  {release.publishedAt && (
                    <time className="font-mono text-xs text-faint" dateTime={release.publishedAt}>
                      {formatDate(release.publishedAt)}
                    </time>
                  )}
                </div>
                <div className="mt-5">
                  <ReleaseNotes text={release.notes} />
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  )
}
