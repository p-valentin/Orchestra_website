// Server-side Polar surface: creating a Checkout Session. Kept to a plain
// fetch against the documented REST endpoint rather than the SDK — this is one
// POST, and the codebase already treats each payment provider as a small
// hand-rolled module it fully understands (see supabase/functions/_shared).
//
// This module is SERVER ONLY. POLAR_ACCESS_TOKEN must never reach the browser,
// which is why the checkout session is minted in app/api/checkout and only its
// resulting URL is handed back. That also makes the account binding
// trustworthy: metadata.user_id comes from a JWT the server verified, not from
// anything the page could set.
//
// Env (mirrors the NEXT_PUBLIC_PADDLE_* convention it replaces):
//   POLAR_ACCESS_TOKEN            server-only org access token (polar_oat_…)
//   NEXT_PUBLIC_POLAR_PRODUCT_ID  the $149 lifetime product id
//   NEXT_PUBLIC_POLAR_ENV         'sandbox' | 'production' (default production)
// Sandbox and production are separate Polar accounts with separate tokens and
// product ids, so switching environments is env-only — never a code change.
//
// Import this from route handlers and server components only. POLAR_ACCESS_TOKEN
// carries no NEXT_PUBLIC_ prefix, so Next strips it from any client bundle and
// the fetch below would fail closed rather than leak it — but the boundary is
// worth keeping deliberate: the client half lives in lib/polarCheckout.ts.

const SANDBOX = process.env.NEXT_PUBLIC_POLAR_ENV === 'sandbox'

export const POLAR_API_BASE = SANDBOX ? 'https://sandbox-api.polar.sh' : 'https://api.polar.sh'

export interface CheckoutSession {
  id: string
  url: string
}

export class PolarNotConfigured extends Error {}
export class PolarRequestFailed extends Error {
  constructor(readonly status: number, body: string) {
    super(`Polar checkout creation failed (${status}): ${body.slice(0, 300)}`)
  }
}

// Creates a one-off Checkout Session for the lifetime product, bound to the
// account that is buying.
//
// `userId` lands in metadata, which Polar copies onto the resulting Order and
// delivers to webhooks-polar — that is the ONLY thing the webhook attaches on.
// `email` is a prefill and nothing more: the buyer can change it at Polar, and
// that must not be able to misdirect the license.
export async function createCheckoutSession(opts: {
  userId: string
  email?: string
  origin: string
}): Promise<CheckoutSession> {
  const accessToken = process.env.POLAR_ACCESS_TOKEN
  const productId = process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID
  if (!accessToken || !productId) throw new PolarNotConfigured('POLAR_ACCESS_TOKEN / NEXT_PUBLIC_POLAR_PRODUCT_ID unset')

  const res = await fetch(`${POLAR_API_BASE}/v1/checkouts/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    // A hung upstream would otherwise hold the request open until the platform
    // timeout, with the buyer staring at a spinner.
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      products: [productId],
      // The account binding. Polar caps metadata keys at 40 chars; `user_id`
      // matches the custom_data.user_id the Paddle path used, so the webhook
      // contract reads the same either way.
      metadata: { user_id: opts.userId },
      ...(opts.email ? { customer_email: opts.email } : {}),
      // /account watches for ?checkout=success and polls the license into view,
      // so the buyer never sees "No license yet" in the seconds before the
      // webhook lands.
      success_url: `${opts.origin}/account?checkout=success`,
      // Security measure for the overlay: Polar will only postMessage to this
      // origin. The embed script sends it as a query param too; setting it on
      // the session is the authoritative half.
      embed_origin: opts.origin,
    }),
  })

  if (!res.ok) throw new PolarRequestFailed(res.status, await res.text().catch(() => ''))

  const body = await res.json()
  if (typeof body?.url !== 'string' || typeof body?.id !== 'string') {
    throw new PolarRequestFailed(res.status, 'response missing id/url')
  }
  return { id: body.id, url: body.url }
}
