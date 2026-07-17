import type { Metadata } from 'next'
import AuthShell, { AuthNote, AuthLink } from '@/components/AuthShell'
import WelcomeRedirect from '@/components/WelcomeRedirect'

// Where Supabase sends people after they click the signup confirmation link.
// Nothing to do here but tell them the truth: the account is live, and the
// next step happens in the app, not the browser.
export const metadata: Metadata = {
  title: 'Account confirmed — Orchestra',
  robots: { index: false, follow: false },
}

export default function WelcomePage() {
  return (
    <AuthShell
      title="Account confirmed"
      intro="That's the browser part done."
      footer={
        <>
          Don&apos;t have the app yet? <AuthLink href="/downloads">Download Orchestra</AuthLink>.
        </>
      }
    >
      <WelcomeRedirect />
      <div className="space-y-4">
        <AuthNote>✓ Your account is confirmed. Signing you in…</AuthNote>
        <p className="text-sm text-muted">
          Taking you to your account. If you bought a license with this email it&apos;s already
          attached; otherwise your 14-day trial starts the first time you sign in inside Orchestra.
        </p>
      </div>
    </AuthShell>
  )
}
