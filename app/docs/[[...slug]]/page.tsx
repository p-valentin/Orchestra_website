import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import DocsMarkdown from '@/components/docs/DocsMarkdown'
import DocsPrevNext from '@/components/docs/DocsPrevNext'
import { allDocParams, getDocBySlug } from '@/lib/docs'

// Every path comes from the manifest and is prerendered at build time, when
// the markdown files are read from disk. Unknown /docs/* URLs 404. Unlike the
// blog there is no force-dynamic here — runtime rendering would look for
// content files that don't ship in the serverless bundle.
export const dynamicParams = false

interface Props {
  params: Promise<{ slug?: string[] }>
}

export function generateStaticParams(): { slug: string[] }[] {
  return allDocParams()
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug = [] } = await params
  const doc = getDocBySlug(slug)
  if (!doc) return { title: 'Not found — Orchestra' }
  return {
    title: doc.href === '/docs' ? 'Docs — Orchestra' : `${doc.title} — Orchestra Docs`,
    description: doc.description,
    alternates: { canonical: doc.href },
    openGraph: { type: 'article', title: doc.title, description: doc.description },
  }
}

export default async function DocPage({ params }: Props) {
  const { slug = [] } = await params
  const doc = getDocBySlug(slug)
  if (!doc) notFound()

  return (
    <article className="max-w-3xl">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-brass">{doc.sectionLabel}</p>
      <h1 className="mt-4 font-display text-4xl font-medium leading-[1.05] tracking-tight sm:text-5xl">{doc.title}</h1>
      <p className="mt-4 text-lg text-muted">{doc.description}</p>
      <div className="mt-10">
        <DocsMarkdown text={doc.body} />
      </div>
      <DocsPrevNext prev={doc.prev} next={doc.next} />
    </article>
  )
}
