import type { Metadata } from 'next'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createSessionToken, SESSION_COOKIE, SESSION_HOURS, verifyPassword } from '@/lib/adminAuth'
import { clearFailures, lockedOut, recordFailure } from '@/lib/loginGuard'
import { totpEnabled, verifyTotp } from '@/lib/totp'
import { recordAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Sign in — Orchestra',
  robots: { index: false, follow: false },
}

async function clientIp(): Promise<string> {
  const h = await headers()
  const fwd = h.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return h.get('x-real-ip') ?? 'unknown'
}

async function login(formData: FormData): Promise<void> {
  'use server'
  const ip = await clientIp()
  if (await lockedOut(ip)) redirect('/admin/login?error=locked')

  // Password and (when enabled) TOTP fail identically, so a probe can't learn
  // which factor was wrong. Both count toward the same lockout.
  const password = String(formData.get('password') ?? '')
  const code = String(formData.get('code') ?? '')
  const ok = verifyPassword(password) && (!totpEnabled() || verifyTotp(code))
  if (!ok) {
    await recordFailure(ip)
    await recordAudit('login-failed', undefined, ip)
    redirect((await lockedOut(ip)) ? '/admin/login?error=locked' : '/admin/login?error=wrong')
  }

  const token = await createSessionToken()
  if (!token) redirect('/admin/login?error=wrong')

  await clearFailures(ip)
  await recordAudit('login', undefined, ip)
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
  wrong: 'Wrong credentials.',
  locked: 'Too many attempts — login is locked for 15 minutes.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const message = error ? MESSAGES[error] : null
  const withTotp = totpEnabled()

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
        {withTotp && (
          <input
            type="text"
            name="code"
            required
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            autoComplete="one-time-code"
            placeholder="6-digit code"
            className="mt-3 w-full rounded-lg border border-line-strong bg-well px-4 py-3 font-mono text-fg outline-none focus:border-brass"
          />
        )}
        <button className="mt-4 w-full rounded-lg bg-brass px-5 py-3 font-semibold text-[#1a1306] transition-colors hover:bg-brass-bright">
          Sign in
        </button>
      </form>
    </main>
  )
}
