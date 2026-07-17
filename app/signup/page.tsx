import type { Metadata } from 'next'
import AuthShell, { AuthLink } from '@/components/AuthShell'
import SignupForm from '@/components/SignupForm'

export const metadata: Metadata = {
  title: 'Create your account — Orchestra',
  description: 'Create an Orchestra account to start your 14-day trial or activate a license you already bought.',
  robots: { index: false, follow: false },
}

export default function SignupPage() {
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
