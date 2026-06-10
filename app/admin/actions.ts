'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { isAdminRequest } from '@/lib/adminAuth'
import { deleteRelease, saveRelease, setPublished } from '@/lib/releases'

const VERSION_RE = /^\d+\.\d+\.\d+$/

async function requireAdmin(): Promise<void> {
  const h = await headers()
  if (!isAdminRequest(h.get('authorization'))) throw new Error('unauthorized')
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
  if (!VERSION_RE.test(version)) return
  await saveRelease(version, notes.slice(0, 10_000))
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
