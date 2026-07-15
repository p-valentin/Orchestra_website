// Claim email via Resend — best-effort by design (§2.4): a failure is logged
// and swallowed; the buyer can always log in and auto-claim. Mirrors the
// website's lib/email.ts conventions (RESEND_FROM, plain text).

const RESEND_BASE_URL = Deno.env.get('RESEND_BASE_URL') ?? 'https://api.resend.com'
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://orchestra-automation.com'

// §4: no license keys in the email — the account IS the license.
// `reference` is the provider's human-friendly order/invoice number (Paddle:
// invoice_number, e.g. "113783-10001") — the one printed on the buyer's
// receipt, so support can match it. Null when the provider didn't send one.
export function claimEmailText(reference: string | null): string {
  return [
    'Thanks for buying Orchestra!',
    '',
    'Already have an account? Just log in with this email address in the app —',
    'your license attaches automatically.',
    '',
    'New to Orchestra? Download the app and create your account with this',
    `email address: ${SITE_URL}/downloads`,
    '',
    reference !== null ? `Order reference (for support): ${reference}` : 'Questions? Just reply to this email.',
  ].join('\n')
}

export async function sendClaimEmail(to: string, reference: string | null): Promise<boolean> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    console.log(`[email] RESEND_API_KEY unset — claim email for ${to} not sent`)
    return false
  }
  try {
    const res = await fetch(`${RESEND_BASE_URL}/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: Deno.env.get('RESEND_FROM') ?? 'Orchestra <onboarding@resend.dev>',
        to,
        subject: 'Your Orchestra license is ready',
        text: claimEmailText(reference),
      }),
    })
    if (!res.ok) {
      console.error('[email] Resend rejected claim email:', res.status, await res.text().catch(() => ''))
    }
    return res.ok
  } catch (err) {
    console.error('[email] claim email failed:', err instanceof Error ? err.message : err)
    return false
  }
}
