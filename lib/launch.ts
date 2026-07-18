// Pre-launch switches. Both default OFF, so an incomplete or fresh environment
// can never expose an unverified checkout or open account sign-ups by accident.
// Flip them via env once the live payment path is verified — a Vercel var plus a
// redeploy, no code change:
//   NEXT_PUBLIC_PAID_ENABLED=1    turns the Buy buttons on
//   NEXT_PUBLIC_SIGNUP_ENABLED=1  turns account creation on
//
// PAID_ENABLED is a deliberate "go live" switch ON TOP OF the Paddle keys being
// present (lib/paddle PADDLE_CONFIGURED): the button is live only when both are
// true, so setting the keys early (e.g. for the $1 smoke test) doesn't expose a
// real Buy button before you mean to.
export const PAID_ENABLED = process.env.NEXT_PUBLIC_PAID_ENABLED === '1'
export const SIGNUP_ENABLED = process.env.NEXT_PUBLIC_SIGNUP_ENABLED === '1'
