import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import AccountPanel from '@/components/AccountPanel'

export const metadata: Metadata = {
  title: 'Your account — Orchestra',
  description: 'Your Orchestra license, trial, and devices.',
  robots: { index: false, follow: false },
}

export default function AccountPage() {
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
