import type { Metadata } from 'next'
import AuthShell, { AuthLink } from '@/components/AuthShell'
import SignupForm from '@/components/SignupForm'
import { SIGNUP_ENABLED } from '@/lib/launch'

export const metadata: Metadata = {
  title: 'Create your account — Orchestra',
  description: 'Create an Orchestra account to start your 14-day trial or activate a license you already bought.',
  robots: { index: false, follow: false },
}

export default function SignupPage() {
  if (!SIGNUP_ENABLED) {
    return (
      <AuthShell
        title="Accounts open at launch"
        intro="Sign-ups aren’t open just yet — we’re finishing the last checks before launch."
        footer={
          <>
            Already have an account? <AuthLink href="/login">Sign in</AuthLink>.
          </>
        }
      >
        <p className="text-sm text-muted">
          Orchestra is almost ready. Accounts and the 14-day trial open at launch — in the
          meantime you can still <AuthLink href="/downloads">download the app</AuthLink>.
        </p>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Create your account"
      intro="Your account is your license. Bought Orchestra already? Use the same email you paid with — it attaches automatically."
      footer={
        <>
          Already have an account? <AuthLink href="/login">Sign in</AuthLink>. Forgot your password?{' '}
          <AuthLink href="/forgot-password">Reset it</AuthLink>.
          <span className="mt-2 block text-xs text-faint">
            By creating an account you agree to the <AuthLink href="/eula">EULA</AuthLink> and{' '}
            <AuthLink href="/privacy">Privacy Policy</AuthLink>.
          </span>
        </>
      }
    >
      <SignupForm />
    </AuthShell>
  )
}
