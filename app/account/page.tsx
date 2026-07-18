import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import AccountPanel from '@/components/AccountPanel'
import { ACCOUNTS_ENABLED } from '@/lib/launch'

export const metadata: Metadata = {
  title: 'Your account — Orchestra',
  description: 'Your Orchestra license, trial, and devices.',
  robots: { index: false, follow: false },
}

export default function AccountPage() {
  // Account area closed pre-launch — even a lingering session can't reach it.
  if (!ACCOUNTS_ENABLED) redirect('/')

  return (
    <>
      <Nav />
      <main className="mx-auto min-h-[70vh] max-w-2xl px-6 pb-20 pt-32">
        <AccountPanel />
      </main>
      <Footer />
    </>
  )
}
