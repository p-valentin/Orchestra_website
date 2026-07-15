import type { Metadata } from 'next'
import AuthShell, { AuthNote, AuthLink } from '@/components/AuthShell'

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
      <div className="space-y-4">
        <AuthNote>✓ Your account is ready. Open Orchestra and sign in with it.</AuthNote>
        <p className="text-sm text-muted">
          If you already bought a license with this email, it attaches the moment you sign in —
          there&apos;s no key to copy. Otherwise your 14-day trial starts on first sign-in.
        </p>
      </div>
    </AuthShell>
  )
}
