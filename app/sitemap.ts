import type { MetadataRoute } from 'next'
import { publishedPosts } from '@/lib/blog'
import { allDocParams, docHref } from '@/lib/docs'
import { LANDING_PAGES } from '@/lib/landing'
import { SITE_URL } from '@/lib/site'

// Every URL here must be on the canonical host and must answer 200. It used to
// list the apex, which 308-redirects to www — so all 31 entries were redirects
// and Search Console had nothing to index cleanly. See lib/site.ts.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE_URL
  const posts = await publishedPosts()
  const now = new Date()
  return [
    { url: base, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/downloads`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    // The keyword landing pages: static, so they are always indexable and never
    // depend on storage being reachable at request time.
    ...LANDING_PAGES.map(page => ({
      url: `${base}/${page.slug}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.9,
    })),
    { url: `${base}/blog`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${base}/releases`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    ...allDocParams().map(({ slug }) => ({
      url: `${base}${docHref(slug)}`,
      lastModified: now,
      changeFrequency: slug.length ? ('monthly' as const) : ('weekly' as const),
      priority: slug.length ? 0.6 : 0.8,
    })),
    ...posts.map(post => ({
      url: `${base}/blog/${post.slug}`,
      lastModified: new Date(post.updatedAt),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    // Indexable real content that was simply left out. Low priority, but a
    // sitemap that omits pages Google reaches anyway reads as incomplete.
    ...['/privacy', '/eula', '/refunds', '/acceptable-use'].map(path => ({
      url: `${base}${path}`,
      lastModified: now,
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
  ]
}
