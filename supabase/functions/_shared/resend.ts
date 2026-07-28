// Purchase confirmation via Resend — best-effort by design (§2.4): a failure is
// logged and swallowed; the buyer can always sign in and see their license.
//
// Two different emails, because there are two genuinely different situations:
//
//   claimed   The normal Polar purchase. Buying requires a signed-in account
//             and the webhook attached the license to it, so the buyer has
//             nothing to do — telling them to "create your account" (as the
//             Paddle-era copy did) is confusing at best, and reads like a
//             phishing prompt at worst.
//   unclaimed The anomaly: no resolvable account on the order (and the legacy
//             Paddle buy-before-signup path). Here the sign-up instructions
//             ARE the point, because the license is waiting to be claimed.
//
// §4 holds either way: no license keys in the email — the account is the
// license, there is nothing to paste.
//
// Deliverability/trust notes, since a bare-links plaintext mail reads as spam:
// both a text/plain and a text/html part are sent, the merchant of record is
// named (buyers see "POLAR" on their card statement and otherwise report it as
// fraud), and the amount + order reference are shown so the mail can be
// reconciled against the receipt.

const RESEND_BASE_URL = Deno.env.get('RESEND_BASE_URL') ?? 'https://api.resend.com'
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://orchestra-automation.com'
const SUPPORT_EMAIL = Deno.env.get('SUPPORT_EMAIL') ?? 'hello@orchestra-automation.com'

export interface ClaimEmailOptions {
  // True when the webhook attached the license to an account. Defaults to
  // false so the Paddle handler — which cannot know — keeps its old copy.
  claimed?: boolean
  // Minor units (e.g. 14900) and ISO currency, straight off the order. Shown
  // only when both are present.
  amountCents?: number | null
  currency?: string | null
  // Who sold it. Named because it appears on the card statement.
  merchantOfRecord?: string
}

function formatAmount(amountCents?: number | null, currency?: string | null): string | null {
  if (typeof amountCents !== 'number' || !Number.isFinite(amountCents) || !currency) return null
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amountCents / 100)
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`
  }
}

export function claimEmailText(reference: string | null, opts: ClaimEmailOptions = {}): string {
  const amount = formatAmount(opts.amountCents, opts.currency)
  const mor = opts.merchantOfRecord ?? 'Polar'

  const lines: string[] = ['Thanks for buying Orchestra!', '']

  if (opts.claimed) {
    // Deliberately does NOT enumerate what the buyer doesn't have to do ("no
    // key to copy", "nothing to activate"). Listing absent steps invites the
    // reader to wonder whether some step exists after all; stating that it is
    // active and how to open it is the whole message.
    lines.push(
      'Your lifetime license is active and already attached to this account.',
      '',
      'Just open Orchestra and sign in with this email address.',
      '',
      `Download Orchestra: ${SITE_URL}/downloads`,
      `Your account:       ${SITE_URL}/account`,
    )
  } else {
    lines.push(
      'Your lifetime license is ready and waiting for an account.',
      '',
      'Two steps to pick it up:',
      `  1. Create your account with THIS email address: ${SITE_URL}/signup`,
      `  2. Download Orchestra and sign in: ${SITE_URL}/downloads`,
      '',
      'The license attaches automatically when you sign in. There is no key to copy.',
    )
  }

  lines.push('', '—', 'Orchestra — lifetime license')
  if (amount) lines.push(`Paid: ${amount}`)
  if (reference !== null) lines.push(`Order reference: ${reference}`)
  lines.push(
    `Sold by ${mor}, our merchant of record — this is what appears on your card statement.`,
    `Questions, or something look wrong? Reply to this email or write to ${SUPPORT_EMAIL}.`,
  )
  return lines.join('\n')
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Table layout + inline styles: the only thing that renders consistently across
// mail clients. Colours mirror the site (bg #0b0a08, brass #d9b36a) so the mail
// looks like it came from the same place the buyer just paid on — brand
// continuity is the cheapest anti-phishing signal there is.
export function claimEmailHtml(reference: string | null, opts: ClaimEmailOptions = {}): string {
  const amount = formatAmount(opts.amountCents, opts.currency)
  const mor = esc(opts.merchantOfRecord ?? 'Polar')

  const body = opts.claimed
    ? `
        <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#f3eee2;">
          Your <strong style="color:#eed9a4;">lifetime license is active</strong> and already attached to
          this account.
        </p>
        <p style="margin:0 0 28px;font-size:16px;line-height:1.6;color:#a59c88;">
          Just open Orchestra and sign in with this email address.
        </p>`
    : `
        <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#f3eee2;">
          Your <strong style="color:#eed9a4;">lifetime license is ready</strong> and waiting for an account.
        </p>
        <p style="margin:0 0 28px;font-size:16px;line-height:1.6;color:#a59c88;">
          Create your account with <strong style="color:#f3eee2;">this email address</strong>, then sign in —
          the license attaches automatically. There is no key to copy.
        </p>`

  const ctaHref = opts.claimed ? `${SITE_URL}/downloads` : `${SITE_URL}/signup`
  const ctaLabel = opts.claimed ? 'Download Orchestra' : 'Create your account'
  const secondHref = opts.claimed ? `${SITE_URL}/account` : `${SITE_URL}/downloads`
  const secondLabel = opts.claimed ? 'View your account' : 'Download Orchestra'

  const row = (label: string, value: string) => `
          <tr>
            <td style="padding:4px 0;font-size:13px;color:#6f6754;">${esc(label)}</td>
            <td style="padding:4px 0;font-size:13px;color:#a59c88;text-align:right;">${value}</td>
          </tr>`

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="color-scheme" content="dark light">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0b0a08;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0a08;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#13110c;border:1px solid rgba(243,238,226,0.10);border-radius:12px;">
        <tr><td style="padding:32px 32px 0;">
          <p style="margin:0 0 24px;font-family:Georgia,serif;font-size:20px;color:#d9b36a;letter-spacing:0.02em;">Orchestra</p>
          <h1 style="margin:0 0 20px;font-family:Georgia,serif;font-size:26px;font-weight:500;line-height:1.2;color:#f3eee2;">
            Thanks for buying Orchestra
          </h1>
          ${body}
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 12px;">
            <tr><td style="border-radius:8px;background:#d9b36a;">
              <a href="${ctaHref}" style="display:inline-block;padding:12px 24px;font-family:system-ui,sans-serif;font-size:15px;font-weight:600;color:#1a1306;text-decoration:none;">${ctaLabel}</a>
            </td></tr>
          </table>
          <p style="margin:0 0 28px;font-size:14px;">
            <a href="${secondHref}" style="color:#a59c88;text-decoration:underline;">${secondLabel}</a>
          </p>
        </td></tr>
        <tr><td style="padding:0 32px 28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid rgba(243,238,226,0.10);padding-top:16px;">
            ${row('Product', 'Orchestra — lifetime license')}
            ${amount ? row('Paid', esc(amount)) : ''}
            ${reference !== null ? row('Order reference', esc(reference)) : ''}
          </table>
          <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#6f6754;">
            Sold by ${mor}, our merchant of record — this is the name that appears on your card statement.
            Questions, or something look wrong? Just reply to this email, or write to
            <a href="mailto:${esc(SUPPORT_EMAIL)}" style="color:#8a744a;">${esc(SUPPORT_EMAIL)}</a>.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

// Refund confirmation. Polar sends its own refund receipt as merchant of
// record, but that says nothing about the licence — so a buyer who refunds
// otherwise discovers the deactivation only when Orchestra stops working.
// Saying it plainly, immediately, is both kinder and cheaper than the support
// ticket that follows a silent deactivation.
export function refundEmailText(reference: string | null, opts: ClaimEmailOptions = {}): string {
  const amount = formatAmount(opts.amountCents, opts.currency)
  const mor = opts.merchantOfRecord ?? 'Polar'
  const lines = [
    'Your Orchestra refund is confirmed.',
    '',
    'The lifetime license on this account has been deactivated, and Orchestra',
    'will stop working on your devices at its next check.',
    '',
    'Flows you built are yours to keep — they stay on your machine, and the',
    'Playwright code Orchestra exported remains yours to use.',
    '',
    'Changed your mind? You can buy again any time:',
    `  ${SITE_URL}/#pricing`,
    '',
    '—',
  ]
  if (amount) lines.push(`Refunded: ${amount}`)
  if (reference !== null) lines.push(`Order reference: ${reference}`)
  lines.push(
    `Refunded by ${mor}, our merchant of record. The money goes back to the card you paid with —`,
    'timing depends on your bank, usually 5–10 business days.',
    `Didn't request this? Tell us straight away: ${SUPPORT_EMAIL}.`,
  )
  return lines.join('\n')
}

export function refundEmailHtml(reference: string | null, opts: ClaimEmailOptions = {}): string {
  const amount = formatAmount(opts.amountCents, opts.currency)
  const mor = esc(opts.merchantOfRecord ?? 'Polar')
  const row = (label: string, value: string) => `
          <tr>
            <td style="padding:4px 0;font-size:13px;color:#6f6754;">${esc(label)}</td>
            <td style="padding:4px 0;font-size:13px;color:#a59c88;text-align:right;">${value}</td>
          </tr>`

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="color-scheme" content="dark light">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0b0a08;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0a08;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#13110c;border:1px solid rgba(243,238,226,0.10);border-radius:12px;">
        <tr><td style="padding:32px 32px 0;">
          <p style="margin:0 0 24px;font-family:Georgia,serif;font-size:20px;color:#d9b36a;letter-spacing:0.02em;">Orchestra</p>
          <h1 style="margin:0 0 20px;font-family:Georgia,serif;font-size:26px;font-weight:500;line-height:1.2;color:#f3eee2;">
            Your refund is confirmed
          </h1>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#f3eee2;">
            The lifetime license on this account has been <strong style="color:#eed9a4;">deactivated</strong>,
            and Orchestra will stop working on your devices at its next check.
          </p>
          <p style="margin:0 0 28px;font-size:16px;line-height:1.6;color:#a59c88;">
            Flows you built are yours to keep — they stay on your machine, and the Playwright code
            Orchestra exported remains yours to use.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
            <tr><td style="border-radius:8px;border:1px solid rgba(217,179,106,0.5);">
              <a href="${SITE_URL}/#pricing" style="display:inline-block;padding:12px 24px;font-family:system-ui,sans-serif;font-size:15px;font-weight:600;color:#eed9a4;text-decoration:none;">Buy again</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 32px 28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid rgba(243,238,226,0.10);padding-top:16px;">
            ${amount ? row('Refunded', esc(amount)) : ''}
            ${reference !== null ? row('Order reference', esc(reference)) : ''}
          </table>
          <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#6f6754;">
            Refunded by ${mor}, our merchant of record. The money goes back to the card you paid with —
            timing depends on your bank, usually 5–10 business days.
            Didn't request this? Tell us straight away at
            <a href="mailto:${esc(SUPPORT_EMAIL)}" style="color:#8a744a;">${esc(SUPPORT_EMAIL)}</a>.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

async function send(to: string, subject: string, text: string, html: string): Promise<boolean> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    console.log(`[email] RESEND_API_KEY unset — "${subject}" for ${to} not sent`)
    return false
  }
  try {
    const res = await fetch(`${RESEND_BASE_URL}/emails`, {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: Deno.env.get('RESEND_FROM') ?? 'Orchestra <onboarding@resend.dev>',
        to,
        reply_to: SUPPORT_EMAIL,
        subject,
        // Both parts: some clients (and most spam filters) treat an
        // HTML-only mail with several links as a negative signal.
        text,
        html,
      }),
    })
    if (!res.ok) {
      console.error('[email] Resend rejected:', subject, res.status, await res.text().catch(() => ''))
    }
    return res.ok
  } catch (err) {
    console.error('[email] send failed:', subject, err instanceof Error ? err.message : err)
    return false
  }
}

export async function sendRefundEmail(
  to: string,
  reference: string | null,
  opts: ClaimEmailOptions = {},
): Promise<boolean> {
  return await send(to, 'Your Orchestra refund is confirmed', refundEmailText(reference, opts), refundEmailHtml(reference, opts))
}

export interface OwnerRefundNotice {
  orderId: string
  reference: string | null
  buyerEmail: string
  accountEmail: string | null
  amountCents?: number | null
  currency?: string | null
}

// Owner-facing refund alert. Deliberately plain text and deliberately terse:
// this is an operational notification to one inbox, not a customer email, and
// it should be skimmable on a phone. Goes to OWNER_EMAIL, falling back to the
// support address.
//
// Refunds are the one payment event worth an unprompted ping — a purchase is
// good news that the dashboard already records, while a refund may be a
// dissatisfied buyer, a chargeback, or a bug, and all three want a human
// looking sooner rather than at month end.
export function ownerRefundNoticeText(n: OwnerRefundNotice): string {
  const amount = formatAmount(n.amountCents, n.currency)
  return [
    'A licence was refunded and is now deactivated.',
    '',
    `Amount:    ${amount ?? '(not reported)'}`,
    `Reference: ${n.reference ?? '(none)'}`,
    `Order id:  ${n.orderId}`,
    `Buyer:     ${n.buyerEmail || '(none on record)'}`,
    `Account:   ${n.accountEmail ?? '(unclaimed — licence was never attached)'}`,
    '',
    `Admin: ${SITE_URL}/admin`,
    '',
    'The buyer has been emailed a refund confirmation. No action needed unless',
    'this looks wrong — a refund you did not initiate may be a chargeback.',
  ].join('\n')
}

export async function sendOwnerRefundNotice(n: OwnerRefundNotice): Promise<boolean> {
  const to = Deno.env.get('OWNER_EMAIL') ?? SUPPORT_EMAIL
  const text = ownerRefundNoticeText(n)
  const amount = formatAmount(n.amountCents, n.currency)
  return await send(
    to,
    `Orchestra refund — ${amount ?? 'amount unknown'} — ${n.reference ?? n.orderId}`,
    text,
    // Plain content in a <pre> keeps the operational mail readable in clients
    // that insist on rendering the HTML part, without maintaining a second
    // layout for an internal notice.
    `<pre style="font:14px/1.6 ui-monospace,Menlo,monospace;white-space:pre-wrap;">${esc(text)}</pre>`,
  )
}

export async function sendClaimEmail(
  to: string,
  reference: string | null,
  opts: ClaimEmailOptions = {},
): Promise<boolean> {
  return await send(
    to,
    opts.claimed ? 'Your Orchestra license is active' : 'Your Orchestra license is ready',
    claimEmailText(reference, opts),
    claimEmailHtml(reference, opts),
  )
}
