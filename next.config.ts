import type { NextConfig } from 'next'

// The account pages (/signup, /forgot-password, /reset-password) talk to
// Supabase Auth from the browser, so its origin has to be allowed to connect —
// with `connect-src 'self'` alone every signup dies as "Failed to fetch", which
// looks like a broken product rather than a policy. Read from the env so the
// policy can never drift from the project the pages actually use.
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin
  } catch {
    return '' // unset (e.g. a preview without env): the pages are inert anyway
  }
})()

// Paddle Billing overlay checkout loads its script from cdn.paddle.com and
// renders the payment window in iframes under *.paddle.com, so those origins
// have to be allowed across the relevant directives (per Paddle's CSP guidance).
const PADDLE = 'https://*.paddle.com'

const ContentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${PADDLE}`,
  `style-src 'self' 'unsafe-inline' fonts.googleapis.com ${PADDLE}`,
  "font-src 'self' fonts.gstatic.com",
  // downloads host allowed so blog posts can embed images/GIFs hosted on the
  // public R2 bucket alongside the app binaries; Paddle for checkout assets
  `img-src 'self' data: https://downloads.orchestra-automation.com ${PADDLE}`,
  // Paddle checkout runs in an iframe.
  `frame-src ${PADDLE}`,
  ['connect-src', "'self'", supabaseOrigin, PADDLE].filter(Boolean).join(' '),
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: ContentSecurityPolicy },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
