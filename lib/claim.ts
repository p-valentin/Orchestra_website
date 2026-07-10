import { sendEmail, sendLicenseEmail } from './email'
import { getLicenseStatus } from './licenses'
import { upsertClaim } from './claims'
import { licenseConfigured, signLicense } from './token'
import { rateLimit } from './rateLimit'

export type ClaimResult =
  | { ok: true; token: string; emailed: boolean }
  | { ok: false; reason: 'closed' | 'not-configured' }

// Records a free-license claim from the website form or the desktop app, mints
// the signed token, and emails it to the claimer. Idempotent via upsertClaim, so
// re-claiming returns the same token without double-counting. The token is always
// returned on success (the app stores it directly); `emailed` reports whether the
// delivery email went out — the website path treats false as a failure since
// email is its only channel.
export async function recordClaim(email: string, source: string): Promise<ClaimResult> {
  // Checked before any writes: without a signing key the claim can never be
  // fulfilled, and recording it anyway would consume a license slot for
  // someone who only ever saw an error.
  if (!licenseConfigured()) return { ok: false, reason: 'not-configured' }

  const status = await getLicenseStatus()
  if (status.closed) return { ok: false, reason: 'closed' }

  const { record, created } = await upsertClaim(email, 'lifetime', source)
  const token = signLicense({ email: record.email, plan: record.plan, issuedAt: record.issuedAt })
  if (!token) return { ok: false, reason: 'not-configured' }

  // Repeat claims are legitimate (lost key → re-claim = resend), but bound the
  // delivery per address: the IP rate limit is per-instance on serverless, so on
  // its own the endpoint could be scripted to bomb a victim's inbox.
  const emailAllowed = rateLimit('claim-email:' + email.toLowerCase()).allowed
  const emailed = emailAllowed && (await sendLicenseEmail(email, token))
  // Owner notification is best-effort, never gates the claim, and only fires
  // for genuinely new claims — repeats used to spam the owner too. The public
  // count is derived from the per-email records, so nothing else to update.
  if (created) {
    await sendEmail(
      'New license claim',
      `${email} just claimed a ${record.plan} license.\n\nSource: ${source}`,
      email,
    )
  }
  return { ok: true, token, emailed }
}
