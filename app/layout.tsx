import type { Metadata, Viewport } from 'next'
import { Fraunces, Inter, JetBrains_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import TrackPageview from '@/components/TrackPageview'
import { SITE_URL } from '@/lib/site'
import './globals.css'

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-fraunces',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Orchestra — Build browser automations, export plain Playwright',
    template: '%s',
  },
  description:
    'A desktop app for building browser automations. Build the flow visually, watch it run in a real browser, export plain Playwright you own. No cloud, no subscription.',
  applicationName: 'Orchestra',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Orchestra — Build browser automations, export plain Playwright',
    description:
      'A desktop app for building browser automations. Build the flow visually, watch it run in a real browser, export plain Playwright you own. No cloud, no subscription.',
    type: 'website',
    siteName: 'Orchestra',
    url: SITE_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Orchestra — Build browser automations, export plain Playwright',
    description:
      'A desktop app for building browser automations. Build the flow visually, watch it run in a real browser, export plain Playwright you own. No cloud, no subscription.',
  },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: '#0b0a08',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable} ${jetbrains.variable}`}>
      <body className="bg-bg font-sans text-fg">
        {children}
        <TrackPageview />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
