// The Paddle-hosted checkout link, set via NEXT_PUBLIC_CHECKOUT_URL at go-live
// (a sandbox link works for testing). The buy buttons always render — people
// expect them — so until it's configured they fall back to /signup, which is
// the real first step anyway: the account is the license, and a purchase made
// with that email attaches to it automatically.
export const CHECKOUT_URL = process.env.NEXT_PUBLIC_CHECKOUT_URL || '/signup'

// True once a real checkout link is configured. Lets callers show a small
// "opens at launch" hint before go-live without hiding the button.
export const CHECKOUT_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_CHECKOUT_URL)
