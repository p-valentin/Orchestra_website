'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/adminAuth'
import { deleteRelease, saveRelease, setPublished } from '@/lib/releases'

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
  refresh()
}

export async function shipAction(formData: FormData): Promise<void> {
  await requireAdmin()
  const version = String(formData.get('version') ?? '')
  if (!VERSION_RE.test(version)) return
  await setPublished(version, true)
  refresh()
}

export async function unshipAction(formData: FormData): Promise<void> {
  await requireAdmin()
  const version = String(formData.get('version') ?? '')
  if (!VERSION_RE.test(version)) return
  await setPublished(version, false)
  refresh()
}

export async function deleteReleaseAction(formData: FormData): Promise<void> {
  await requireAdmin()
  const version = String(formData.get('version') ?? '')
  if (!VERSION_RE.test(version)) return
  await deleteRelease(version)
  refresh()
}
