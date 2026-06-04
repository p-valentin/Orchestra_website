import type { Metadata, Viewport } from 'next'
import { Fraunces, DM_Sans, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-fraunces',
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
})

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://orchestra-automation.com'),
  title: 'Orchestra — You conduct. It plays.',
  description:
    'Orchestra automates repetitive browser tasks visually — no code required. Every step is yours. Every action is visible.',
  applicationName: 'Orchestra',
  keywords: ['browser automation', 'visual automation', 'playwright', 'no-code', 'web scraping', 'desktop app'],
  openGraph: {
    title: 'Orchestra — You conduct. It plays.',
    description:
      'Automate repetitive browser tasks visually. Every step is yours. Every action is visible.',
    type: 'website',
    siteName: 'Orchestra',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Orchestra — You conduct. It plays.',
    description: 'Automate repetitive browser tasks visually. Real code output. No lock-in.',
  },
  // favicon + apple touch icon are provided by app/icon.svg and app/apple-icon.png
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: '#0b0a08',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${dmSans.variable} ${jetbrains.variable}`}>
      <body className="font-sans bg-bg text-text-primary">{children}</body>
    </html>
  )
}
