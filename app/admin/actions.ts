'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/adminAuth'
import { deleteRelease, saveRelease, setPublished } from '@/lib/releases'
import { deleteFeedback } from '@/lib/feedback'
import { grantLicense, revokeLicense } from '@/lib/licenseGrants'
import { setLegacyClaims, TOTAL_LICENSES } from '@/lib/licenses'
import { deleteClaim } from '@/lib/claims'
import { deletePost, parseTags, savePost, setPostPublished, slugify, SLUG_RE } from '@/lib/blog'
import { recordAudit } from '@/lib/audit'
import { isValidEmail, sanitizeText } from '@/lib/sanitize'

const VERSION_RE = /^\d+\.\d+\.\d+$/

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

// Manual license fulfillment: after a $129 purchase lands, grant the buyer's
// email here — the app's next login/refresh picks it up. Revoke handles
// refunds/chargebacks; the app hard-blocks on its next refresh.
export async function grantLicenseAction(formData: FormData): Promise<void> {
  await requireAdmin()
  const email = sanitizeText(formData.get('email'), 254).toLowerCase()
  if (!isValidEmail(email)) redirect('/admin?error=invalid-email')
  const note = sanitizeText(formData.get('note'), 200)
  await grantLicense(email, 'admin', note || undefined)
  await recordAudit('license-granted', email)
  revalidatePath('/admin')
}

export async function revokeLicenseAction(formData: FormData): Promise<void> {
  await requireAdmin()
  const email = sanitizeText(formData.get('email'), 254).toLowerCase()
  if (isValidEmail(email)) {
    await revokeLicense(email)
    await recordAudit('license-revoked', email)
  }
  revalidatePath('/admin')
}

// Reconcile control for claims that predate per-email records (before Jul
// 2026): the derived public count is records + this offset.
export async function deleteClaimAction(formData: FormData): Promise<void> {
  await requireAdmin()
  const email = sanitizeText(formData.get('email'), 254)
  if (!isValidEmail(email)) return
  await deleteClaim(email)
  await recordAudit('claim-deleted', email)
  revalidatePath('/admin')
  revalidatePath('/')
  revalidatePath('/downloads')
}

export async function setLegacyClaimsAction(formData: FormData): Promise<void> {
  await requireAdmin()
  const count = Number(formData.get('count'))
  if (!Number.isInteger(count) || count < 0 || count > TOTAL_LICENSES) {
    redirect('/admin?error=invalid-count')
  }
  const ok = await setLegacyClaims(count)
  if (!ok) redirect('/admin?error=save-failed')
  await recordAudit('legacy-claims-set', String(count))
  revalidatePath('/admin')
  revalidatePath('/')
  revalidatePath('/downloads')
}

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
