import type { MetadataRoute } from 'next'
import { publishedPosts } from '@/lib/blog'
import { allDocParams, docHref } from '@/lib/docs'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = 'https://orchestra-automation.com'
  const posts = await publishedPosts()
  return [
    { url: base, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/downloads`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/blog`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
    { url: `${base}/releases`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.6 },
    ...allDocParams().map(({ slug }) => ({
      url: `${base}${docHref(slug)}`,
      lastModified: new Date(),
      changeFrequency: slug.length ? ('monthly' as const) : ('weekly' as const),
      priority: slug.length ? 0.6 : 0.8,
    })),
    ...posts.map(post => ({
      url: `${base}/blog/${post.slug}`,
      lastModified: new Date(post.updatedAt),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ]
}
