import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createSessionToken, SESSION_COOKIE, SESSION_HOURS, verifyPassword } from '@/lib/adminAuth'
import { clearFailures, lockedOut, recordFailure } from '@/lib/loginGuard'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Sign in — Orchestra',
  robots: { index: false, follow: false },
}

async function login(formData: FormData): Promise<void> {
  'use server'
  if (await lockedOut()) redirect('/admin/login?error=locked')

  const password = String(formData.get('password') ?? '')
  if (!verifyPassword(password)) {
    await recordFailure()
    redirect((await lockedOut()) ? '/admin/login?error=locked' : '/admin/login?error=wrong')
  }

  const token = await createSessionToken()
  if (!token) redirect('/admin/login?error=wrong')

  await clearFailures()
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/admin',
    maxAge: SESSION_HOURS * 3600,
  })
  redirect('/admin')
}

const MESSAGES: Record<string, string> = {
  wrong: 'Wrong password.',
  locked: 'Too many attempts — login is locked for 15 minutes.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const message = error ? MESSAGES[error] : null

  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <form action={login} className="w-full max-w-sm rounded-xl border border-line bg-panel p-8">
        <h1 className="font-display text-2xl font-medium tracking-tight">Orchestra admin</h1>
        {message && (
          <p role="alert" className="mt-4 rounded-lg border border-[#e06c63]/40 bg-[#e06c63]/10 px-3 py-2 text-sm text-[#f0a8a2]">
            {message}
          </p>
        )}
        <input
          type="password"
          name="password"
          required
          autoFocus
          autoComplete="current-password"
          placeholder="Password"
          className="mt-5 w-full rounded-lg border border-line-strong bg-well px-4 py-3 text-fg outline-none focus:border-brass"
        />
        <button className="mt-4 w-full rounded-lg bg-brass px-5 py-3 font-semibold text-[#1a1306] transition-colors hover:bg-brass-bright">
          Sign in
        </button>
      </form>
    </main>
  )
}
