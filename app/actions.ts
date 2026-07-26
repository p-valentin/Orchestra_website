'use server'

import { headers } from 'next/headers'
import { rateLimit } from '@/lib/rateLimit'
import { sanitizeText, isValidEmail } from '@/lib/sanitize'
import type { ContactState, WaitlistState } from '@/lib/contact'

async function requestIp(): Promise<string> {
  const h = await headers()
  const fwd = h.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return h.get('x-real-ip') ?? 'unknown'
}

async function sendEmail(subject: string, text: string, replyTo?: string): Promise<void> {
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

export async function submitContact(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const honeypot = formData.get('company')
  if (typeof honeypot === 'string' && honeypot.trim() !== '') {
    return { ok: true, message: 'Thanks — your message is on its way.', errors: {} }
  }

  const limit = rateLimit(await requestIp())
  if (!limit.allowed) {
    const mins = Math.ceil(limit.retryAfterMs / 60000)
    return {
      ok: false,
      message: `You've sent a few messages already. Try again in about ${mins} minute${mins === 1 ? '' : 's'}.`,
      errors: {},
    }
  }

  const name = sanitizeText(formData.get('name'), 80)
  const email = sanitizeText(formData.get('email'), 254)
  const message = sanitizeText(formData.get('message'), 2000)

  const errors: ContactState['errors'] = {}
  if (name.length < 2) errors.name = 'Please tell me your name.'
  if (!isValidEmail(email)) errors.email = "That email address doesn't look right."
  if (message.length < 10) errors.message = 'A little more detail, please (10+ characters).'

  if (Object.keys(errors).length > 0) {
    return { ok: false, message: '', errors }
  }

  await sendEmail(
    `Orchestra enquiry from ${name}`,
    `From: ${name} <${email}>\n\n${message}`,
    email,
  )

  return { ok: true, message: "Thanks — your message is on its way. I'll reply within a day or two.", errors: {} }
}

// Launch waitlist. Same path as the contact form — honeypot, IP rate limit,
// Resend to CONTACT_EMAIL — because there is no waitlist table: the list lives
// in the owner's inbox until there's a reason for it to live anywhere else.
export async function submitWaitlist(
  _prev: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  const honeypot = formData.get('company')
  if (typeof honeypot === 'string' && honeypot.trim() !== '') {
    return { ok: true, message: "You're on the list.", errors: {} }
  }

  const limit = rateLimit(`waitlist:${await requestIp()}`)
  if (!limit.allowed) {
    const mins = Math.ceil(limit.retryAfterMs / 60000)
    return {
      ok: false,
      message: `You've signed up a few times already. Try again in about ${mins} minute${mins === 1 ? '' : 's'}.`,
      errors: {},
    }
  }

  const email = sanitizeText(formData.get('email'), 254)
  if (!isValidEmail(email)) {
    return { ok: false, message: '', errors: { email: "That email address doesn't look right." } }
  }

  await sendEmail('Orchestra waitlist signup', `Wants to know when licenses go on sale:\n\n${email}`, email)

  return { ok: true, message: "You're on the list. One email when licenses go on sale — nothing else.", errors: {} }
}
