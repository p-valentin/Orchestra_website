import AuthShell, { AuthLink } from '@/components/AuthShell'

// Shown on every account page (/signup, /login, /forgot-password) while the
// account area is closed pre-launch (ACCOUNTS_ENABLED off). One place so the
// three pages read identically.
export default function AccountsClosed() {
  return (
    <AuthShell
      title="Accounts open at launch"
      intro="The account area isn’t open just yet — we’re finishing the last checks before launch."
    >
      <p className="text-sm text-muted">
        Orchestra is almost ready. Sign-in, accounts, and the 14-day trial open at launch — in the
        meantime you can still <AuthLink href="/downloads">download the app</AuthLink>.
      </p>
    </AuthShell>
  )
}
