// Best-effort Resend notification. No-ops when RESEND_API_KEY / CONTACT_EMAIL
// are unset (validated + stored submissions still succeed). Mirrors the helper
// used by the contact/beta server actions so API routes can reuse it.
export async function sendEmail(subject: string, text: string, replyTo?: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.CONTACT_EMAIL
  if (!apiKey || !to) return
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.RESEND_FROM ?? 'Orchestra <onboarding@resend.dev>',
      to,
      reply_to: replyTo,
      subject,
      text,
    }),
  }).catch(() => {})
}
