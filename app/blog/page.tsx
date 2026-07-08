import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import { publishedPosts } from '@/lib/blog'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Blog — Orchestra',
  description:
    'Guides and notes on browser automation, web scraping and web RPA — from the team building Orchestra.',
  alternates: { canonical: '/blog' },
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default async function BlogPage() {
  const posts = await publishedPosts()

  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      <main className="hero-light mx-auto w-full max-w-3xl flex-1 px-5 pb-32 pt-40 sm:px-8">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-brass">Blog</p>
        <h1 className="mt-4 font-display text-5xl font-medium leading-[1.0] tracking-tight sm:text-6xl">
          Notes on automating the web.
        </h1>
        <p className="mt-6 max-w-xl text-muted">
          Browser automation, web scraping, web RPA — practical guides from building Orchestra.
        </p>

        {posts.length === 0 ? (
          <p className="mt-10 text-muted">First post coming soon.</p>
        ) : (
          <div className="mt-14 flex flex-col gap-6">
            {posts.map(post => (
              <a
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group rounded-xl border border-line bg-panel p-7 transition-colors hover:border-brass/50 sm:p-8"
              >
                <article>
                  {post.publishedAt && (
                    <time className="font-mono text-xs text-faint" dateTime={post.publishedAt}>
                      {formatDate(post.publishedAt)}
                    </time>
                  )}
                  <h2 className="mt-2 font-display text-2xl font-medium tracking-tight transition-colors group-hover:text-brass-bright sm:text-3xl">
                    {post.title}
                  </h2>
                  {post.description && <p className="mt-2 text-muted">{post.description}</p>}
                  <p className="mt-4 font-mono text-xs text-brass">Read →</p>
                </article>
              </a>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  )
}
