'use client'

import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { AuthError } from '@/components/AuthShell'
import { CHECKOUT_URL } from '@/lib/checkout'

// Everything here is read via the anon client under RLS — a signed-in user
// can only ever see their own rows. The one write (freeing a device slot)
// goes through the devices Edge Function, which scopes by the caller's JWT.

type License = { status: string; plan: string; purchased_at: string }
type Trial = { started_at: string; ends_at: string }
type Device = {
  id: string
  name: string | null
  platform: string | null
  app_version: string | null
  last_seen_at: string
}

const MAX_DEVICES = 3
const PLATFORM_LABEL: Record<string, string> = { windows: 'Windows', macos: 'macOS', linux: 'Linux' }

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-panel p-6">
      <h2 className="font-display text-lg font-medium">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function Pill({ tone, children }: { tone: 'good' | 'warn' | 'off'; children: React.ReactNode }) {
  const tones = {
    good: 'border-brass/40 bg-brass/10 text-brass-bright',
    warn: 'border-[#f0a8a2]/30 bg-[#f0a8a2]/10 text-[#f0a8a2]',
    off: 'border-line-strong bg-well text-muted',
  }
  return (
    <span className={`inline-block rounded-full border px-3 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  )
}

export default function AccountPanel() {
  const [email, setEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [licenses, setLicenses] = useState<License[]>([])
  const [trial, setTrial] = useState<Trial | null>(null)
  const [devices, setDevices] = useState<Device[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [deviceError, setDeviceError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const sb = supabaseBrowser()
      const { data } = await sb.auth.getSession()
      if (!data.session) {
        window.location.replace('/login')
        return
      }
      if (cancelled) return
      setEmail(data.session.user.email ?? null)

      const [lic, tri, dev] = await Promise.all([
        sb.from('licenses').select('status, plan, purchased_at').order('purchased_at', { ascending: false }),
        sb.from('trials').select('started_at, ends_at').maybeSingle(),
        sb
          .from('devices')
          .select('id, name, platform, app_version, last_seen_at')
          .is('revoked_at', null)
          .order('last_seen_at', { ascending: false }),
      ])
      if (cancelled) return
      const failed = lic.error ?? tri.error ?? dev.error
      if (failed) setLoadError(`Couldn’t load your account data (${failed.message}). Refresh to try again.`)
      setLicenses(lic.data ?? [])
      setTrial(tri.data ?? null)
      setDevices(dev.data ?? [])
      setLoading(false)
    })().catch((err) => {
      if (!cancelled) {
        setLoadError(err instanceof Error ? err.message : 'Something went wrong — refresh to try again.')
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function signOut() {
    // Local scope: signing out of the website must not revoke the session
    // the desktop app holds for the same account.
    await supabaseBrowser().auth.signOut({ scope: 'local' })
    window.location.assign('/')
  }

  async function removeDevice(device: Device) {
    const label = device.name ?? 'this device'
    if (!window.confirm(`Remove ${label}? Orchestra on it will stop working within 7 days, and its slot frees up right away.`)) return
    setRemoving(device.id)
    setDeviceError(null)
    const { error } = await supabaseBrowser().functions.invoke('devices/deactivate', {
      body: { device_id: device.id },
    })
    if (error) {
      setDeviceError('Couldn’t remove the device — try again in a moment.')
    } else {
      setDevices((prev) => prev.filter((d) => d.id !== device.id))
    }
    setRemoving(null)
  }

  if (loading) {
    return <p className="py-24 text-center text-muted">Loading your account…</p>
  }

  const activeLicense = licenses.find((l) => l.status === 'active') ?? null
  const deadLicense = activeLicense ? null : (licenses[0] ?? null)
  const trialDaysLeft = trial ? Math.max(0, Math.ceil((new Date(trial.ends_at).getTime() - Date.now()) / 86_400_000)) : null
  const trialActive = trialDaysLeft !== null && new Date(trial!.ends_at).getTime() > Date.now()

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-medium">Your account</h1>
          <p className="mt-1 text-sm text-muted">{email}</p>
        </div>
        <button
          onClick={signOut}
          className="rounded-lg border border-line-strong px-4 py-2 text-sm text-muted transition-colors hover:border-brass/50 hover:text-fg"
        >
          Sign out
        </button>
      </div>

      <AuthError message={loadError} />

      <Section title="License">
        {activeLicense ? (
          <div className="space-y-2">
            <Pill tone="good">Lifetime license — active</Pill>
            <p className="text-sm text-muted">
              Purchased {shortDate(activeLicense.purchased_at)}. Sign in inside Orchestra with this
              email and it just works — no key to enter.
            </p>
          </div>
        ) : deadLicense ? (
          <div className="space-y-2">
            <Pill tone="warn">{deadLicense.status === 'refunded' ? 'Refunded' : 'Revoked'}</Pill>
            <p className="text-sm text-muted">
              This license is no longer active. If that seems wrong, reply to your purchase receipt
              and we’ll sort it out.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <Pill tone="off">No license yet</Pill>
            <p className="text-sm text-muted">
              Orchestra is a one-time purchase with a 14-day free trial — no card needed for the
              trial, it starts the first time you run the app.
            </p>
          </div>
        )}
        {!activeLicense && (
          <a
            href={CHECKOUT_URL}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brass px-5 py-2.5 text-sm font-semibold text-[#1a1306] transition-colors hover:bg-brass-bright"
          >
            {deadLicense ? 'Buy a new lifetime license — $129' : 'Buy a lifetime license — $129'}
          </a>
        )}
      </Section>

      {!activeLicense && (
        <Section title="Trial">
          {trial ? (
            trialActive ? (
              <div className="space-y-2">
                <Pill tone="good">{trialDaysLeft === 1 ? '1 day left' : `${trialDaysLeft} days left`}</Pill>
                <p className="text-sm text-muted">
                  Full access until {shortDate(trial.ends_at)}. Everything keeps working — buying a
                  license just removes the deadline.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Pill tone="warn">Trial ended {shortDate(trial.ends_at)}</Pill>
                <p className="text-sm text-muted">
                  Your work is untouched — a license picks up exactly where the trial left off.
                </p>
              </div>
            )
          ) : (
            <div className="space-y-2">
              <Pill tone="off">Not started</Pill>
              <p className="text-sm text-muted">
                Your 14-day trial starts automatically the first time you sign in inside the
                Orchestra app.
              </p>
            </div>
          )}
        </Section>
      )}

      <Section title={`Devices — ${devices.length} of ${MAX_DEVICES} slots used`}>
        {devices.length === 0 ? (
          <p className="text-sm text-muted">
            No devices yet. A slot is used the first time Orchestra runs on a machine while signed
            in to this account.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{d.name ?? 'Unnamed device'}</p>
                  <p className="text-xs text-muted">
                    {[
                      d.platform ? PLATFORM_LABEL[d.platform] ?? d.platform : null,
                      d.app_version ? `Orchestra ${d.app_version}` : null,
                      `last seen ${shortDate(d.last_seen_at)}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <button
                  onClick={() => removeDevice(d)}
                  disabled={removing === d.id}
                  className="shrink-0 rounded-lg border border-line-strong px-3 py-1.5 text-xs text-muted transition-colors hover:border-[#f0a8a2]/50 hover:text-[#f0a8a2] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {removing === d.id ? 'Removing…' : 'Remove'}
                </button>
              </li>
            ))}
          </ul>
        )}
        <AuthError message={deviceError} />
        {devices.length > 0 && (
          <p className="mt-3 text-xs text-faint">
            Removing a device frees its slot immediately; Orchestra on that device stops working
            within 7 days.
          </p>
        )}
      </Section>
    </div>
  )
}
