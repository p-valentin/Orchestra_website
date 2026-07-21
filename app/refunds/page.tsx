import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Markdown from '@/components/Markdown'

export const metadata: Metadata = {
  title: 'Refund Policy — Orchestra',
  description:
    'How refunds work for Orchestra: a 14-day free trial, Paddle as merchant of record, and your EU/UK right of withdrawal.',
  alternates: { canonical: '/refunds' },
}

// Standalone refund policy — the same facts stated in the EULA's "Buying,
// taxes, refunds" section, pulled out as a clearly-labelled policy (Paddle
// domain verification wants a visible, distinct refund policy).

const REFUNDS = `
Orchestra is a one-time purchase, sold through **Paddle**, our merchant of record. This page explains how refunds work and how to request one. Questions any time: [hello@orchestra-automation.com](mailto:hello@orchestra-automation.com).

## Try it free first

Every account gets a **14-day free trial** of the complete product — no card required. We built the trial so you can be sure Orchestra fits your needs *before* you pay; it's the surest way to avoid needing a refund at all.

## How to request a refund

Because your purchase is processed by **Paddle** — the merchant of record and seller of record for the transaction — refunds are issued through Paddle. To request one, either:

- Email us at [hello@orchestra-automation.com](mailto:hello@orchestra-automation.com) and we'll arrange it, or
- Contact Paddle directly using the receipt they emailed you.

Refund eligibility is determined by Paddle's applicable buyer terms together with the rights below. We aim to respond to any refund request within a day or two.

## EU and UK right of withdrawal

If you are a consumer in the EU or UK, you have a statutory **14-day right of withdrawal** for digital purchases. Ask us or Paddle within 14 days of your purchase and it will be honored — no reason required.

## What happens to your license

When a purchase is refunded or charged back, its license is **deactivated** and the account returns to its pre-purchase state. Your work is never touched: the flows you built and any code you exported remain yours and keep working.

## Contact

For anything to do with a refund, email [hello@orchestra-automation.com](mailto:hello@orchestra-automation.com).
`

export default function RefundsPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-6 pb-24 pt-36">
        <h1 className="font-display text-4xl font-medium tracking-tight sm:text-5xl">Refund Policy</h1>
        <p className="mt-3 text-sm text-muted">Last updated: July 21, 2026</p>
        <div className="mt-10">
          <Markdown text={REFUNDS} />
        </div>
      </main>
      <Footer />
    </>
  )
}
