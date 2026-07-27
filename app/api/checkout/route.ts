import { type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createCheckoutSession, PolarNotConfigured } from '@/lib/polar'
import { PAID_ENABLED } from '@/lib/launch'
import { rateLimit } from '@/lib/rateLimit'

// Mints a Polar Checkout Session for the signed-in buyer.
//
// The whole reason this is a server route rather than a client-side checkout
// call: the account binding has to be trustworthy. The browser sends its
// Supabase access token, the server verifies it with Supabase Auth, and the
// user id that goes into checkout metadata is the one from the VERIFIED token —
// never a value the page supplied. webhooks-polar then attaches the license on
// that id alone, so neither a changed email at checkout nor a tampered client
// can point a purchase at someone else's account.
//
// The browser never sees POLAR_ACCESS_TOKEN; it gets back only the session URL.

function requestIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return req.headers.get('x-real-ip') ?? 'unknown'
}

export async function POST(request: NextRequest) {
  // Buying is gated the same way the button is. Without this a direct POST
  // could mint live checkout sessions before launch, which is exactly what the
  // flag exists to prevent.
  if (!PAID_ENABLED) {
    return Response.json({ error: 'checkout_disabled' }, { status: 503 })
  }

  // Session creation is an upstream API call; don't let a flood turn into
  // Polar API load. Deliberately looser than the contact-form default (3/hour):
  // opening the overlay, closing it and reopening is normal buyer behaviour,
  // and a rate-limited Buy button is indistinguishable from a broken store.
  if (!rateLimit('checkout:' + requestIp(request), { max: 12, windowMs: 15 * 60 * 1000 }).allowed) {
    return Response.json({ error: 'rate_limited' }, { status: 429 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    return Response.json({ error: 'not_configured' }, { status: 503 })
  }

  const match = (request.headers.get('authorization') ?? '').match(/^Bearer\s+(.+)$/i)
  if (!match) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  // getUser() validates the JWT against Supabase Auth — this is the identity
  // the purchase gets bound to.
  const supabase = createClient(url, anonKey, { auth: { persistSession: false } })
  const { data, error } = await supabase.auth.getUser(match[1]!)
  if (error || !data.user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const origin = new URL(request.url).origin
  try {
    const session = await createCheckoutSession({
      userId: data.user.id,
      email: data.user.email ?? undefined,
      origin,
    })
    return Response.json({ url: session.url })
  } catch (err) {
    if (err instanceof PolarNotConfigured) {
      console.error('[checkout] Polar env missing:', err.message)
      return Response.json({ error: 'not_configured' }, { status: 503 })
    }
    console.error('[checkout] session creation failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'checkout_unavailable' }, { status: 502 })
  }
}
