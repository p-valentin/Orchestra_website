import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://orchestra-automation.com'
  return [
    { url: base, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/downloads`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
  ]
}
