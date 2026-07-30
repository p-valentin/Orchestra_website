import type { Metadata } from 'next'
import LandingPage from '@/components/LandingPage'
import { landingPage } from '@/lib/landing'

// Static by default — no force-dynamic, no storage read. A landing page whose
// indexability depends on R2 being up is not a landing page.
const page = landingPage('web-rpa')!

export const metadata: Metadata = {
  title: page.title,
  description: page.description,
  keywords: page.keywords,
  alternates: { canonical: `/${page.slug}` },
  // images is required here: declaring openGraph at all replaces the root
  // block wholesale, and without it the page ships no preview image.
  openGraph: {
    type: 'website',
    title: page.title,
    description: page.description,
    url: `/${page.slug}`,
    images: ['/opengraph-image'],
  },
  twitter: { card: 'summary_large_image', images: ['/opengraph-image'] },
}

export default function Page() {
  return <LandingPage page={page} />
}
