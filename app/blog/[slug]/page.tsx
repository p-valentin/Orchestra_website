import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Markdown from '@/components/Markdown'
import { getPost } from '@/lib/blog'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string }>
}

// Drafts and unknown slugs 404 identically, so a draft URL leaks nothing.
async function publishedPost(slug: string) {
  const post = await getPost(slug)
  return post?.publishedAt ? post : null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const post = await publishedPost(slug)
  if (!post) return { title: 'Not found — Orchestra' }
  return {
    title: `${post.title} — Orchestra`,
    description: post.description || undefined,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.description || undefined,
      publishedTime: post.publishedAt ?? undefined,
      modifiedTime: post.updatedAt,
    },
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params
  const post = await publishedPost(slug)
  if (!post) notFound()

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    url: `https://orchestra-automation.com/blog/${post.slug}`,
    author: { '@type': 'Organization', name: 'Orchestra' },
    publisher: { '@type': 'Organization', name: 'Orchestra', url: 'https://orchestra-automation.com' },
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      <main className="hero-light mx-auto w-full max-w-3xl flex-1 px-5 pb-32 pt-40 sm:px-8">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <article>
          <a href="/blog" className="font-mono text-xs uppercase tracking-[0.18em] text-brass hover:text-brass-bright">
            ← Blog
          </a>
          <h1 className="mt-4 font-display text-4xl font-medium leading-[1.05] tracking-tight sm:text-5xl">
            {post.title}
          </h1>
          {post.publishedAt && (
            <time className="mt-4 block font-mono text-xs text-faint" dateTime={post.publishedAt}>
              {formatDate(post.publishedAt)}
            </time>
          )}
          <div className="mt-10">
            <Markdown text={post.body} />
          </div>
        </article>

        <div className="mt-16 rounded-xl border border-line bg-panel p-7 sm:p-8">
          <h2 className="font-display text-2xl font-medium tracking-tight">Try Orchestra</h2>
          <p className="mt-2 text-muted">
            A desktop studio for browser automation — build flows visually, watch them run live, and export
            plain Playwright code you own forever.
          </p>
          <a
            href="/downloads"
            className="mt-5 inline-block rounded-lg bg-brass px-5 py-2.5 text-sm font-semibold text-[#1a1306] transition-colors hover:bg-brass-bright"
          >
            Download free
          </a>
        </div>
      </main>
      <Footer />
    </div>
  )
}
