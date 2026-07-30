'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/adminAuth'
import { deleteRelease, saveRelease, setPublished } from '@/lib/releases'
import { deleteFeedback } from '@/lib/feedback'
import { deletePost, parseTags, savePost, setPostPublished, slugify, SLUG_RE } from '@/lib/blog'
import { recordAudit } from '@/lib/audit'
import { sendAsSupport } from '@/lib/email'
import { getMailThread, markThreadRead, recordSentEmail } from '@/lib/adminData'
import { rateLimit } from '@/lib/rateLimit'
import { sensitiveDataUnlocked } from '@/lib/totp'
import { isValidEmail, sanitizeMessageBody, sanitizeText } from '@/lib/sanitize'

const VERSION_RE = /^\d+\.\d+\.\d+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function requireAdmin(): Promise<void> {
  const jar = await cookies()
  if (!(await verifySessionToken(jar.get(SESSION_COOKIE)?.value))) throw new Error('unauthorized')
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
  redirect('/admin/login')
}

function refresh(): void {
  revalidatePath('/admin')
  revalidatePath('/releases')
  revalidatePath('/downloads')
}

export async function saveReleaseAction(formData: FormData): Promise<void> {
  await requireAdmin()
  const version = String(formData.get('version') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim()
  if (!VERSION_RE.test(version)) redirect('/admin?error=invalid-version')
  const ok = await saveRelease(version, notes.slice(0, 10_000))
  if (!ok) redirect('/admin?error=save-failed')
  await recordAudit('release-saved', `v${version}`)
  refresh()
}

export async function shipAction(formData: FormData): Promise<void> {
  await requireAdmin()
  const version = String(formData.get('version') ?? '')
  if (!VERSION_RE.test(version)) return
  await setPublished(version, true)
  await recordAudit('release-shipped', `v${version}`)
  refresh()
}

export async function unshipAction(formData: FormData): Promise<void> {
  await requireAdmin()
  const version = String(formData.get('version') ?? '')
  if (!VERSION_RE.test(version)) return
  await setPublished(version, false)
  await recordAudit('release-unshipped', `v${version}`)
  refresh()
}

export async function deleteReleaseAction(formData: FormData): Promise<void> {
  await requireAdmin()
  const version = String(formData.get('version') ?? '')
  if (!VERSION_RE.test(version)) return
  await deleteRelease(version)
  await recordAudit('release-deleted', `v${version}`)
  refresh()
}

export async function deleteFeedbackAction(formData: FormData): Promise<void> {
  await requireAdmin()
  const id = String(formData.get('id') ?? '')
  if (id) await deleteFeedback(id)
  revalidatePath('/admin')
}

// The licence-grant, revoke, claim-delete and legacy-offset actions lived here.
// They drove the Licenses tab, which fronted the pre-Supabase R2 licensing
// store — a second, parallel account system that nothing has called since the
// app moved to Supabase. Tab, actions and store are all gone; purchases now
// come from Polar and are read through the admin-data Edge Function.

function refreshBlog(slug?: string): void {
  revalidatePath('/admin')
  revalidatePath('/blog')
  if (slug) revalidatePath(`/blog/${slug}`)
  revalidatePath('/sitemap.xml')
}

export async function savePostAction(formData: FormData): Promise<void> {
  await requireAdmin()
  const title = sanitizeText(formData.get('title'), 120)
  const description = sanitizeText(formData.get('description'), 200)
  const body = String(formData.get('body') ?? '').trim().slice(0, 50_000)
  const tags = parseTags(sanitizeText(formData.get('tags'), 400))
  // An existing slug means editing; otherwise it's derived from the title so
  // URLs stay stable across later title tweaks.
  const slug = String(formData.get('slug') ?? '').trim() || slugify(title)
  if (!title || !SLUG_RE.test(slug)) redirect('/admin?error=invalid-post')
  const ok = await savePost({ slug, title, description, body, tags })
  if (!ok) redirect('/admin?error=save-failed')
  await recordAudit('post-saved', slug)
  refreshBlog(slug)
}

export async function publishPostAction(formData: FormData): Promise<void> {
  await requireAdmin()
  const slug = String(formData.get('slug') ?? '')
  if (!SLUG_RE.test(slug)) return
  await setPostPublished(slug, true)
  await recordAudit('post-published', slug)
  refreshBlog(slug)
}

export async function unpublishPostAction(formData: FormData): Promise<void> {
  await requireAdmin()
  const slug = String(formData.get('slug') ?? '')
  if (!SLUG_RE.test(slug)) return
  await setPostPublished(slug, false)
  await recordAudit('post-unpublished', slug)
  refreshBlog(slug)
}

export async function deletePostAction(formData: FormData): Promise<void> {
  await requireAdmin()
  const slug = String(formData.get('slug') ?? '')
  if (!SLUG_RE.test(slug)) return
  await deletePost(slug)
  await recordAudit('post-deleted', slug)
  refreshBlog(slug)
}


export interface AdminEmailState {
  ok: boolean
  message: string
}

// Compose-and-send from the support address.
//
// This is the only admin control that reaches OUTSIDE the system — everything
// else edits our own records, whereas a bad send lands in a stranger's inbox
// with our domain on it and cannot be recalled. So it carries the same second
// factor as the customer data (production requires TOTP), a rate limit, and an
// audit entry recording who was written to and about what.
//
// The recipient is typed rather than picked from Purchases on purpose: pulling
// customer addresses into the admin UI would undo the masking that currently
// makes this page safe to screenshot.
export async function sendAdminEmailAction(
  _prev: AdminEmailState,
  formData: FormData,
): Promise<AdminEmailState> {
  await requireAdmin()

  if (!sensitiveDataUnlocked()) {
    return { ok: false, message: 'Enable two-factor (ADMIN_TOTP_SECRET) before sending mail from production.' }
  }

  // Modest by design: this is for replying to people, not for campaigns. A
  // burst would more likely be a stuck form than intent.
  if (!rateLimit('admin-email', { max: 20, windowMs: 60 * 60 * 1000 }).allowed) {
    return { ok: false, message: 'Too many sends in the last hour. Wait a bit.' }
  }

  const to = sanitizeText(formData.get('to'), 254)
  const subject = sanitizeText(formData.get('subject'), 200)
  const body = sanitizeMessageBody(formData.get('body'), 10_000)

  if (!isValidEmail(to)) return { ok: false, message: 'That recipient address does not look right.' }
  if (subject.length < 2) return { ok: false, message: 'Give it a subject.' }
  if (body.length < 2) return { ok: false, message: 'The message is empty.' }

  return await deliver({ to, subject, body, source: 'admin-form' })
}

// Send, then record — for both the compose box and the reply box, so there is
// one place that knows what "sending an email" entails.
//
// Recording is best-effort and comes AFTER the send, in that order, because the
// send is the thing that cannot be undone: a message that went out but was not
// logged is a gap in the record, whereas a message logged and not sent would be
// a lie the owner acts on. The audit entry keeps its old shape — recipient and
// subject, never the body — while the message text goes to the thread, which is
// the surface built to hold it. See migration 0010 for where that line sits and
// why it is not the same line.
async function deliver(opts: {
  to: string
  subject: string
  body: string
  source: string
  threadId?: string
}): Promise<AdminEmailState> {
  const result = await sendAsSupport(opts.to, opts.subject, opts.body)

  if (!result.ok) {
    await recordAudit('email-failed', `${opts.to} — ${opts.subject}`)
    await recordSentEmail({
      to_email: opts.to,
      subject: opts.subject,
      status: 'failed',
      error: result.error ?? null,
      source: opts.source,
      // No body on a failure: it never reached anyone, so it is not part of a
      // conversation and the send log holds no bodies.
    }).catch(() => false)
    return { ok: false, message: result.error ?? 'Sending failed.' }
  }

  await recordAudit('email-sent', `${opts.to} — ${opts.subject}`)
  const recorded = await recordSentEmail({
    to_email: opts.to,
    subject: opts.subject,
    status: 'sent',
    provider_id: result.id ?? null,
    source: opts.source,
    body: opts.body,
    thread_id: opts.threadId ?? null,
  }).catch(() => false)

  refresh()
  // Said out loud rather than swallowed: the mail is gone either way, and an
  // owner who thinks a reply is filed when it is not will answer the same
  // person twice.
  return {
    ok: true,
    message: recorded
      ? `Sent to ${opts.to}.`
      : `Sent to ${opts.to} — but recording it failed, so it will not appear in the thread.`,
  }
}

// ---------- inbox ----------

export async function markThreadReadAction(formData: FormData): Promise<void> {
  await requireAdmin()
  if (!sensitiveDataUnlocked()) return
  const id = String(formData.get('thread') ?? '')
  if (UUID_RE.test(id)) await markThreadRead(id)
  revalidatePath('/admin')
}

// Reply to a thread.
//
// The recipient is NOT taken from the form. It is looked up server-side from
// the thread id, with reveal, and never rendered in the browser — which is what
// lets the inbox stay masked while still being answerable. A form field
// carrying the address would put it in the page source, in the POST body and in
// anything that logs either, and would let a tampered field send this reply to
// somebody else entirely under our own domain.
export async function replyToThreadAction(
  _prev: AdminEmailState,
  formData: FormData,
): Promise<AdminEmailState> {
  await requireAdmin()

  if (!sensitiveDataUnlocked()) {
    return { ok: false, message: 'Enable two-factor (ADMIN_TOTP_SECRET) before sending mail from production.' }
  }
  if (!rateLimit('admin-email', { max: 20, windowMs: 60 * 60 * 1000 }).allowed) {
    return { ok: false, message: 'Too many sends in the last hour. Wait a bit.' }
  }

  const threadId = String(formData.get('thread') ?? '')
  if (!UUID_RE.test(threadId)) return { ok: false, message: 'That conversation no longer exists.' }

  const body = sanitizeMessageBody(formData.get('body'), 10_000)
  if (body.length < 2) return { ok: false, message: 'The message is empty.' }

  const thread = await getMailThread(threadId, true)
  if (!thread) return { ok: false, message: 'Could not load that conversation.' }

  const to = thread.thread.participant_email
  if (!isValidEmail(to)) return { ok: false, message: 'That conversation has no usable reply address.' }

  return await deliver({
    to,
    subject: thread.thread.reply_subject,
    body,
    source: 'admin-reply',
    threadId,
  })
}
