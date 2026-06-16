'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rateLimit'
import { sanitizeText, isValidEmail } from '@/lib/sanitize'
import { recordClaim } from '@/lib/claim'
import type { ContactState } from '@/lib/contact'
import type { BetaState } from '@/lib/beta'

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

export async function claimBeta(_prev: BetaState, formData: FormData): Promise<BetaState> {
  const honeypot = formData.get('company')
  if (typeof honeypot === 'string' && honeypot.trim() !== '') {
    return { ok: true, message: "You're in — we'll email your license at 1.0." }
  }

  const limit = rateLimit('beta:' + (await requestIp()))
  if (!limit.allowed) {
    const mins = Math.ceil(limit.retryAfterMs / 60000)
    return {
      ok: false,
      message: '',
      error: `Too many attempts. Try again in about ${mins} minute${mins === 1 ? '' : 's'}.`,
    }
  }

  const email = sanitizeText(formData.get('email'), 254)
  if (!isValidEmail(email)) {
    return { ok: false, message: '', error: "That email address doesn't look right." }
  }

  const result = await recordClaim(email, 'website')
  if (!result.ok) {
    if (result.reason === 'closed') {
      return { ok: false, message: '', error: 'License claims are now closed.' }
    }
    return { ok: false, message: '', error: 'Something went wrong on our end — please try again in a moment.' }
  }

  revalidatePath('/')
  revalidatePath('/downloads')
  return { ok: true, message: "You're in — we'll email your free license when 1.0 ships." }
}
