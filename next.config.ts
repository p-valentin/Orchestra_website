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

// Polar overlay checkout renders the payment window in an iframe served from
// Polar's own origin (sandbox is a separate host, and the session URL decides
// which is used). That is the ONLY directive it needs: the overlay script is
// our own code (lib/polarCheckout.ts, bundled and served from this origin), not
// a third-party CDN bundle — so script-src stays 'self' rather than
// allowlisting a general-purpose npm CDN. Everything else Polar does happens
// inside its own frame, under its own policy.
//
// This replaces the six directives that previously allowed https://*.paddle.com.
const POLAR = 'https://polar.sh https://sandbox.polar.sh'

// React's development build uses eval() — for HMR, for reconstructing
// callstacks across the server/client boundary, and for the RSC dev runtime.
// Without 'unsafe-eval' the dev client throws "eval() is not supported in this
// environment" and stops applying streamed RSC payloads: the server sends the
// whole page, the browser paints the shell, and everything behind a <Suspense>
// boundary silently never arrives. It looks exactly like a page that is stuck
// loading, and it does not reproduce with curl, which runs no JavaScript.
//
// PRODUCTION IS UNCHANGED. This is gated on NODE_ENV so the deployed policy
// keeps refusing eval; the production React build has no such requirement.
const devEval = process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"

const ContentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${devEval}`,
  "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
  "font-src 'self' fonts.gstatic.com",
  // downloads host allowed so blog posts can embed images/GIFs hosted on the
  // public R2 bucket alongside the app binaries.
  "img-src 'self' data: https://downloads.orchestra-automation.com",
  // Polar checkout runs in an iframe.
  `frame-src ${POLAR}`,
  ['connect-src', "'self'", supabaseOrigin].filter(Boolean).join(' '),
  // No <base> retargeting and no form posts to foreign origins — without
  // these, script-src's 'unsafe-inline' (which Next's static rendering needs)
  // leaves injected HTML free to redirect relative URLs or exfiltrate forms.
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
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
  // The "Human-like" instrument category was renamed to "Session & environment".
  // The old path was indexed and linked from outside, so it redirects rather
  // than 404s.
  async redirects() {
    return [
      {
        source: '/docs/instruments/human-like',
        destination: '/docs/instruments/session-environment',
        permanent: true,
      },
    ]
  },
}

export default nextConfig
