import type { Metadata } from 'next'
import AuthShell from '@/components/AuthShell'
import ResetPasswordForm from '@/components/ResetPasswordForm'

// Where Supabase's recovery email lands. The token arrives in the URL
// fragment, so everything here is client-side by necessity.
export const metadata: Metadata = {
  title: 'Set a new password — Orchestra',
  robots: { index: false, follow: false },
}

export default function ResetPasswordPage() {
  return (
    <AuthShell title="Set a new password">
      <ResetPasswordForm />
    </AuthShell>
  )
}
