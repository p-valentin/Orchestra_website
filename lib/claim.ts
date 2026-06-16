import { sendEmail } from './email'
import { decrementLicense, getLicenseStatus } from './licenses'

export type ClaimResult =
  | { ok: true }
  | { ok: false; reason: 'closed' | 'email-failed' }

// Records a free-license claim from either the website form or the desktop app.
// The counter only decrements when the notification email is actually accepted
// by Resend — so the remaining count tracks claims that genuinely reached the
// inbox, and a mail outage can't silently drain the pool.
export async function recordClaim(email: string, source: string): Promise<ClaimResult> {
  const { remaining } = await getLicenseStatus()
  if (remaining <= 0) return { ok: false, reason: 'closed' }

  const sent = await sendEmail(
    'New beta claim',
    `${email} just claimed a free beta license.\n\nSource: ${source}`,
    email,
  )
  if (!sent) return { ok: false, reason: 'email-failed' }

  await decrementLicense()
  return { ok: true }
}
