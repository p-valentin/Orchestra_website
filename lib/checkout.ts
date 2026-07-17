// The Paddle-hosted checkout link, set via NEXT_PUBLIC_CHECKOUT_URL at go-live
// (a sandbox link works for testing). The buy buttons always render — people
// expect them — so until it's configured they fall back to /login. Login is
// the default auth view everywhere; only buttons that literally say "Create an
// account" point at /signup. From /login, creating one is a click away.
export const CHECKOUT_URL = process.env.NEXT_PUBLIC_CHECKOUT_URL || '/login'

// True once a real checkout link is configured. Lets callers show a small
// "opens at launch" hint before go-live without hiding the button.
export const CHECKOUT_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_CHECKOUT_URL)
