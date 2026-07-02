// Resend notification. Returns true only when Resend accepts the message, so
// callers can gate side effects (e.g. decrementing the license counter) on the
// email actually going out. Returns false when unconfigured or on any failure.
// Mirrors the helper used by the contact/beta server actions so API routes can
// reuse it.
export async function sendEmail(subject: string, text: string, replyTo?: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.CONTACT_EMAIL
  if (!apiKey || !to) return false
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
export async function sendLicenseEmail(to: string, token: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return false
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
      body: JSON.stringify({ from, to, subject: 'Your Orchestra license', text }),
    })
    if (!res.ok) console.error('[email] license send rejected:', res.status, await res.text().catch(() => ''))
    return res.ok
  } catch (err) {
    console.error('[email] license send failed:', (err as Error).message)
    return false
  }
}
