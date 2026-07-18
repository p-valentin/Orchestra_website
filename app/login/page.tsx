import type { Metadata } from 'next'
import AuthShell, { AuthLink } from '@/components/AuthShell'
import LoginForm from '@/components/LoginForm'
import { SIGNUP_ENABLED } from '@/lib/launch'

export const metadata: Metadata = {
  title: 'Sign in — Orchestra',
  description: 'Sign in to your Orchestra account to see your license and manage your devices.',
  robots: { index: false, follow: false },
}

export default function LoginPage() {
  return (
    <AuthShell
      title="Sign in"
      intro="See your license, trial, and devices. The Orchestra app has its own sign-in — this is for managing your account."
      footer={
        <>
          {SIGNUP_ENABLED && (
            <>
              No account? <AuthLink href="/signup">Create one</AuthLink>.{' '}
            </>
          )}
          Forgot your password? <AuthLink href="/forgot-password">Reset it</AuthLink>.
        </>
      }
    >
      <LoginForm />
    </AuthShell>
  )
}
