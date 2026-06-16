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
