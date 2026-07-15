import type { Metadata } from 'next'
import AuthShell, { AuthLink } from '@/components/AuthShell'
import ForgotPasswordForm from '@/components/ForgotPasswordForm'

export const metadata: Metadata = {
  title: 'Reset your password — Orchestra',
  robots: { index: false, follow: false },
}

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      intro="We'll email you a link to set a new one."
      footer={
        <>
          Don&apos;t have an account yet? <AuthLink href="/signup">Create one</AuthLink>.
        </>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  )
}
