import type { Metadata, Viewport } from 'next'
import { Fraunces, Inter, JetBrains_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import TrackPageview from '@/components/TrackPageview'
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
  metadataBase: new URL('https://orchestra-automation.com'),
  title: {
    default: 'Orchestra — Browser Automation & Web Scraping Studio',
    template: '%s',
  },
  description:
    'Orchestra is a desktop studio for browser automation, web scraping and web RPA. Build flows visually, watch them run live, and export plain Playwright you own forever. No cloud, no subscription, no lock-in.',
  applicationName: 'Orchestra',
  alternates: { canonical: '/' },
  keywords: [
    'browser automation',
    'web automation',
    'web scraping',
    'web scraping tool',
    'web RPA',
    'browser RPA',
    'RPA software',
    'no-code web scraping',
    'visual automation',
    'automate website tasks',
    'playwright',
    'playwright codegen alternative',
    'no-code automation',
    'desktop automation app',
    'automation tool',
  ],
  openGraph: {
    title: 'Orchestra — Browser Automation & Web Scraping Studio',
    description:
      'Build browser automations and web scrapers visually, watch them run live, export plain Playwright you own forever.',
    type: 'website',
    siteName: 'Orchestra',
    url: 'https://orchestra-automation.com',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Orchestra — Browser Automation & Web Scraping Studio',
    description:
      'Build browser automations and web scrapers visually, watch them run live, export plain Playwright you own forever.',
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
