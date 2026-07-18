import type { Metadata } from 'next'
import AuthShell, { AuthLink } from '@/components/AuthShell'
import WelcomeRedirect from '@/components/WelcomeRedirect'

// Where Supabase sends people after they click the signup confirmation link.
// WelcomeRedirect reads the URL fragment and renders the truth: confirmed and
// signing in, or an expired/used link with a way forward.
export const metadata: Metadata = {
  title: 'Account confirmation — Orchestra',
  robots: { index: false, follow: false },
}

export default function WelcomePage() {
  return (
    <AuthShell
      title="Account confirmation"
      footer={
        <>
          Don&apos;t have the app yet? <AuthLink href="/downloads">Download Orchestra</AuthLink>.
        </>
      }
    >
      <WelcomeRedirect />
    </AuthShell>
  )
}
