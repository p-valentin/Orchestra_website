import { sendEmail } from './email'
import { getLicenseStatus } from './licenses'
import { upsertClaim } from './claims'
import { licenseConfigured, signLicense } from './token'
import { rateLimit } from './rateLimit'

export type ClaimResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'closed' | 'not-configured' }

// Records a free-license claim from the website form or the desktop app and
// mints the signed token. License keys are delivered personally by the owner:
// the claim notifies the owner (token included, ready to forward) instead of
// emailing the claimer. Idempotent via upsertClaim, so re-claiming returns the
// same token without double-counting.
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

  // The owner notification IS the delivery channel. Repeat claims notify too —
  // a re-claim means someone wants their key again — but at most once an hour
  // per address, so the public form can't be scripted to bomb the inbox.
  if (created || rateLimit('claim-notify:' + email.toLowerCase(), { max: 1 }).allowed) {
    await sendEmail(
      created ? 'New license claim' : 'License key re-requested',
      `${email} ${created ? 'claimed a' : 're-requested their'} ${record.plan} license.\n\n` +
        `Source: ${source}\n\nTheir license key — send it to them:\n${token}`,
      email,
    )
  }
  return { ok: true, token }
}
