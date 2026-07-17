// Paddle Billing overlay checkout. When these are set, the buy button opens
// Paddle's payment window right on the page:
//   NEXT_PUBLIC_PADDLE_CLIENT_TOKEN  client-side token (test_… sandbox, live_… prod)
//   NEXT_PUBLIC_PADDLE_PRICE_ID      the $129 lifetime price id (pri_…)
//   NEXT_PUBLIC_PADDLE_ENV           'sandbox' | 'production' (default production)
//
// Paddle.js is loaded lazily on first use — nothing ships to visitors who never
// click buy, and the site works without these set (the button falls back to a
// link, see components/BuyButton).

const CLIENT_TOKEN = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN
const PRICE_ID = process.env.NEXT_PUBLIC_PADDLE_PRICE_ID
const SANDBOX = process.env.NEXT_PUBLIC_PADDLE_ENV === 'sandbox'

export const PADDLE_CONFIGURED = Boolean(CLIENT_TOKEN && PRICE_ID)

interface Paddle {
  Environment: { set(env: string): void }
  Initialize(opts: { token?: string }): void
  Checkout: { open(opts: unknown): void }
}

let ready: Promise<Paddle> | null = null

// Loads and initialises Paddle.js exactly once.
function ensurePaddle(): Promise<Paddle> {
  if (ready) return ready
  ready = new Promise<Paddle>((resolve, reject) => {
    const w = window as unknown as { Paddle?: Paddle }
    const init = () => {
      const P = w.Paddle!
      // Environment must be set before Initialize.
      if (SANDBOX) P.Environment.set('sandbox')
      P.Initialize({ token: CLIENT_TOKEN })
      resolve(P)
    }
    if (w.Paddle) return init()
    const s = document.createElement('script')
    s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js'
    s.async = true
    s.onload = init
    s.onerror = () => reject(new Error('Paddle failed to load'))
    document.head.appendChild(s)
  })
  return ready
}

// Opens the checkout overlay for the lifetime price. Prefilling the email means
// the purchase auto-attaches to that account (the webhook matches on email).
export async function openPaddleCheckout(opts: { email?: string; successUrl?: string } = {}): Promise<void> {
  const P = await ensurePaddle()
  P.Checkout.open({
    items: [{ priceId: PRICE_ID, quantity: 1 }],
    ...(opts.email ? { customer: { email: opts.email } } : {}),
    ...(opts.successUrl ? { settings: { successUrl: opts.successUrl } } : {}),
  })
}
