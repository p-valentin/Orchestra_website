// Resend notification. Returns true only when Resend accepts the message, so
// callers can gate side effects (e.g. decrementing the license counter) on the
// email actually going out. Returns false when unconfigured or on any failure.
// Mirrors the helper used by the contact/beta server actions so API routes can
// reuse it.
export async function sendEmail(subject: string, text: string, replyTo?: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.CONTACT_EMAIL
  if (!apiKey || !to) {
    // Same dev fallback as sendLicenseEmail below: log instead of failing so
    // owner notifications are visible when testing locally.
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[email:dev] to owner — ${subject}\n${text}`)
      return true
    }
    return false
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM ?? 'Orchestra <onboarding@resend.dev>',
        to,
        reply_to: replyTo,
        subject,
        text,
      }),
    })
    if (!res.ok) console.error('[email] Resend rejected:', res.status, await res.text().catch(() => ''))
    return res.ok
  } catch (err) {
    console.error('[email] send failed:', (err as Error).message)
    return false
  }
}

// Delivers the license key to the CLAIMER (not the owner). Carries the one-click
// orchestra:// deep link plus the raw key as a paste fallback. Returns true only
// when Resend accepts it, so the website claim path can treat non-delivery as an
// error (email is the only delivery channel for web claimers).
// Shared shell for customer-facing mail from the website, matching the
// purchase/refund emails the Edge Functions send (supabase/functions/_shared/
// resend.ts). Table layout and inline styles because that is the only thing
// that survives every mail client; the palette is the site's own, so mail
// people receive looks like the product they just used.
function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function emailShell(opts: {
  heading: string
  body: string
  cta?: { href: string; label: string }
  footer?: string
}): string {
  const cta = opts.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
            <tr><td style="border-radius:8px;background:#d9b36a;">
              <a href="${opts.cta.href}" style="display:inline-block;padding:12px 24px;font-family:system-ui,sans-serif;font-size:15px;font-weight:600;color:#1a1306;text-decoration:none;">${esc(opts.cta.label)}</a>
            </td></tr>
          </table>`
    : ''
  const footer = opts.footer
    ? `<tr><td style="padding:0 32px 28px;">
            <p style="margin:0;font-size:12px;line-height:1.6;color:#6f6754;border-top:1px solid rgba(243,238,226,0.10);padding-top:16px;">${opts.footer}</p>
          </td></tr>`
    : ''
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="color-scheme" content="dark light">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0b0a08;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0a08;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#13110c;border:1px solid rgba(243,238,226,0.10);border-radius:12px;">
        <tr><td style="padding:32px 32px 0;">
          <p style="margin:0 0 24px;font-family:Georgia,serif;font-size:20px;color:#d9b36a;letter-spacing:0.02em;">Orchestra</p>
          <h1 style="margin:0 0 20px;font-family:Georgia,serif;font-size:26px;font-weight:500;line-height:1.2;color:#f3eee2;">${esc(opts.heading)}</h1>
          ${opts.body}
          ${cta}
        </td></tr>
        ${footer}
      </table>
    </td></tr>
  </table>
</body></html>`
}

export async function sendLicenseEmail(to: string, token: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    // Local dev has no delivery channel, so print the license instead of
    // failing — otherwise the website claim flow can never succeed locally.
    // Production without a key still returns false: there, non-delivery is a
    // real error the form must surface.
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[email:dev] license for ${to} (not sent, RESEND_API_KEY unset):\n${token}`)
      return true
    }
    return false
  }
  const from = process.env.RESEND_FROM ?? 'Orchestra <onboarding@resend.dev>'
  const activateUrl = `orchestra://activate?token=${encodeURIComponent(token)}`
  const text = [
    'Your Orchestra lifetime license is ready.',
    '',
    'Open Orchestra with this link and it activates automatically:',
    activateUrl,
    '',
    'Or paste this license key into Orchestra → Settings → License:',
    token,
    '',
    'Thanks for being an early supporter.',
  ].join('\n')
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to,
        subject: 'Your Orchestra license',
        // Both parts: an HTML-only mail carrying a link and a long opaque key
        // is a strong spam signal, and some clients render only the text one.
        text,
        html: emailShell({
          heading: 'Your licence is ready',
          body: `
          <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#f3eee2;">
            Open Orchestra with the button below and it activates automatically — nothing to copy.
          </p>
          <p style="margin:0 0 28px;font-size:16px;line-height:1.6;color:#a59c88;">
            Thanks for being an early supporter.
          </p>`,
          cta: { href: activateUrl, label: 'Activate Orchestra' },
          footer:
            'Button not working? Paste this key into Orchestra → Settings → License:<br>' +
            `<span style="color:#a59c88;word-break:break-all;font-family:ui-monospace,Menlo,monospace;">${esc(token)}</span>`,
        }),
      }),
    })
    if (!res.ok) console.error('[email] license send rejected:', res.status, await res.text().catch(() => ''))
    return res.ok
  } catch (err) {
    console.error('[email] license send failed:', (err as Error).message)
    return false
  }
}

// Sends a message from the support address to an arbitrary recipient — the
// /admin compose form.
//
// Deliberately a lighter shell than the purchase/refund emails: those are
// transactional and want branding, whereas this is a person replying to a
// person. A heavily decorated template on "sorry about that, try X" reads as
// automated, which is the opposite of what it is.
//
// The body is plain text from the compose box and is ESCAPED before being put
// in the HTML part. It is typed by an admin, not a customer, but an admin who
// pastes a customer's message into a reply would otherwise be injecting that
// customer's markup into an email sent from our domain.
export async function sendAsSupport(
  to: string,
  subject: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    // NOT the dev fallback the other senders use. Those log-and-return-true so
    // an unrelated local flow (claiming a licence, submitting the contact form)
    // is not blocked by mail config. Here the send IS the whole action, so
    // reporting success for a message that never left would be a lie the admin
    // acts on — they would think a customer had been answered.
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[email:dev] NOT sent to ${to}\nSubject: ${subject}\n\n${body}`)
      return {
        ok: false,
        error: 'Not sent: RESEND_API_KEY is unset here. The message was logged to the server console.',
      }
    }
    return { ok: false, error: 'Email is not configured (RESEND_API_KEY unset).' }
  }

  // No fallback to Resend's onboarding@resend.dev sandbox address, which the
  // other senders accept. The point of this feature is that the reply comes
  // from our own domain instead of a personal Gmail; sending it from a shared
  // Resend test address would be a worse version of the problem, and would
  // look like a phish to whoever receives it.
  const from = process.env.RESEND_FROM
  if (!from) {
    return { ok: false, error: 'Not sent: RESEND_FROM is unset, so there is no verified sender address.' }
  }

  // No explicit reply_to. It used to be CONTACT_EMAIL, which conflates two
  // different things: CONTACT_EMAIL is where OUR notifications land (currently
  // a personal Gmail), not an address customers should ever see. Setting it
  // here put that private address in the reply-to of every support mail, where
  // the recipient sees it the moment they hit reply — exactly the leak this
  // feature exists to prevent.
  //
  // Omitting it makes replies go to the From address, which is the support
  // address itself. That is the behaviour we want, and it stays correct
  // without a second variable having to agree with the first.
  const html = emailShell({
    heading: subject,
    body: `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#f3eee2;white-space:pre-wrap;">${esc(body)}</p>`,
    footer: 'Orchestra — desktop browser automation. Reply to this email and it reaches a person.',
  })

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, text: body, html }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error('[email] support send rejected:', res.status, detail)
      // Resend's message is useful to an admin (bad address, domain not
      // verified) in a way it never is to a customer, so surface it here.
      return { ok: false, error: `Resend rejected it (${res.status}). ${detail.slice(0, 200)}` }
    }
    return { ok: true }
  } catch (err) {
    console.error('[email] support send failed:', (err as Error).message)
    return { ok: false, error: 'Could not reach the mail service.' }
  }
}
