// Polar overlay checkout, client half. Opens the payment window in an iframe
// on top of the page, the way the Paddle overlay it replaces did.
//
// This is a typed reimplementation of @polar-sh/checkout's `embed` entry point
// (Apache-2.0, polarsource/polar, clients/packages/checkout) rather than the
// package itself, for two reasons: the published module is a minified bundle
// and this repo runs `allowJs: false`, and installing it drags in
// @stripe/react-stripe-js, @stripe/stripe-js and date-fns as peers that the
// embed path never touches. The wire protocol it implements is four
// postMessage events, reproduced faithfully below — if Polar changes it, diff
// against that package.
//
// The security-relevant halves, both mirrored exactly:
//   - the iframe URL carries `embed_origin`, so Polar only posts messages back
//     to this origin;
//   - every inbound message is checked against POLAR_ORIGINS before it is
//     read, so no other frame can drive the checkout state machine.
//
// Config lives in NEXT_PUBLIC_POLAR_* (see lib/polar.ts for the server half).
// The checkout SESSION is minted by /api/checkout, never here — the account
// binding has to come from a server-verified JWT.

// Polar serves checkout from its main origins; sandbox is a different host, so
// both are allowed and the session URL decides which is actually used.
const POLAR_ORIGINS = ['https://polar.sh', 'https://sandbox.polar.sh']

// The product id is public (it appears in any checkout link), so it is the
// half of the config the browser is allowed to see — enough to know whether
// checkout is wired at all. The access token is server-side only, so a
// configured-looking button can still fail at /api/checkout; that path returns
// a clean error and the caller falls back rather than dead-ending.
export const POLAR_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID)

interface PolarMessage {
  type?: string
  event?: 'loaded' | 'close' | 'confirmed' | 'success'
  successURL?: string
  redirect?: boolean
}

const MESSAGE_TYPE = 'POLAR_CHECKOUT'

function buildEmbedUrl(checkoutUrl: string): string {
  const url = new URL(checkoutUrl)
  url.searchParams.set('embed', 'true')
  url.searchParams.set('embed_origin', window.location.origin)
  url.searchParams.set('theme', 'dark')
  return url.toString()
}

// Full-viewport iframe over a dimmed page. `allow` delegates the payment and
// passkey permissions the wallet flows (Apple Pay / Google Pay) need — without
// it they silently fail inside a cross-origin frame.
function buildFrame(src: string): HTMLIFrameElement {
  const frame = document.createElement('iframe')
  frame.src = src
  frame.setAttribute('title', 'Secure checkout')
  const origins = POLAR_ORIGINS.join(' ')
  frame.allow = `payment 'self' ${origins}; publickey-credentials-get 'self' ${origins};`
  Object.assign(frame.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    border: 'none',
    zIndex: '2147483647',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    colorScheme: 'auto',
  } satisfies Partial<CSSStyleDeclaration>)
  return frame
}

/**
 * Opens the Polar checkout overlay for an already-created session URL.
 *
 * Resolves when the overlay closes — whether the buyer completed the purchase
 * (Polar redirects the parent to the session's success_url) or dismissed it.
 * Rejects only if the checkout URL is unusable.
 */
export function openPolarOverlay(checkoutUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let src: string
    try {
      src = buildEmbedUrl(checkoutUrl)
    } catch {
      reject(new Error('Polar returned an unusable checkout URL'))
      return
    }

    const frame = buildFrame(src)
    // Once the buyer has confirmed payment, the overlay must not be
    // dismissable — closing mid-capture would leave them unsure whether they
    // had paid.
    let closable = true
    let settled = false

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const teardown = () => {
      if (settled) return
      settled = true
      window.removeEventListener('message', onMessage)
      frame.remove()
      document.body.style.overflow = previousOverflow
      resolve()
    }

    const onMessage = (event: MessageEvent) => {
      // Origin check first: anything not from Polar is not allowed to touch
      // this state machine.
      if (!POLAR_ORIGINS.includes(event.origin)) return
      const message = event.data as PolarMessage | null
      if (!message || message.type !== MESSAGE_TYPE) return

      switch (message.event) {
        case 'confirmed':
          closable = false
          break
        case 'close':
          if (closable) teardown()
          break
        case 'success':
          closable = true
          if (message.redirect && typeof message.successURL === 'string') {
            // Straight to /account?checkout=success, which polls the license
            // into view while the webhook lands.
            window.location.href = message.successURL
            return
          }
          teardown()
          break
      }
    }

    window.addEventListener('message', onMessage)
    document.body.appendChild(frame)
  })
}
