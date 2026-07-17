import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Markdown from '@/components/Markdown'

export const metadata: Metadata = {
  title: 'End User License Agreement — Orchestra',
  description: 'The terms under which Orchestra is licensed: trial, lifetime license, devices, and your ownership of exported code.',
  alternates: { canonical: '/eula' },
}

// Plain-language EULA matching how the product actually works: account-bound
// license, 3 device slots, 14-day trial, weekly entitlement check-ins,
// exported code owned by the user, refund → revocation via Paddle.

const EULA = `
This agreement is between you and Orchestra ([orchestra-automation.com](https://orchestra-automation.com), "we") and covers the Orchestra desktop application and its related services. Installing or using Orchestra means you accept it. If you don't accept it, don't use the software.

## The license you get

When you buy Orchestra, we grant you a **lifetime, non-exclusive, non-transferable license** to install and use it for your own purposes — personal or business. Concretely:

- **One account per person.** Your account is your license; there is no separate license key.
- **Up to 3 devices** activated at once. You can remove a device from your account page at any time to free its slot.
- **One payment, no subscription.** The price includes all updates for as long as Orchestra is offered.
- The license is yours, not your employer's or client's — it may not be shared, resold, rented, or pooled between people.

## The free trial

Every new account gets **14 days** of the full product, starting the first time you sign in inside the app. One trial per person and per machine. When it ends, the app stops running flows until you buy a license — nothing you built is deleted or held hostage.

## What's yours

Everything you make with Orchestra is yours. We claim **no rights** over the flows you build, the data you collect, or the code you export — exported Playwright code carries no restriction from us and keeps working without Orchestra, forever. This agreement covers our software, not your work.

## What you may not do

- Share your account or resell, rent, sublicense, or redistribute the app.
- Circumvent, disable, or tamper with license enforcement, the trial, or device limits.
- Reverse-engineer or decompile the app, except where the law grants that right regardless of this term.
- Use Orchestra for anything unlawful.

## Automation is your responsibility

Orchestra automates real browsers on websites we don't control. **You** are responsible for what your automations do: respecting the terms and rate limits of the sites you automate, and complying with the laws that apply to you and to any data you collect — including privacy laws when scraping personal data. We provide the instrument; you conduct.

## Buying, taxes, refunds

Orchestra is sold through **Paddle**, our merchant of record — Paddle is the seller of record for your purchase and their buyer terms apply at checkout. Prices are in USD; any tax is calculated and added by Paddle at checkout. Refunds are handled through Paddle. **A refunded or charged-back purchase deactivates its license.**

## Staying licensed

The app confirms your license with our servers when you sign in and roughly once a week afterwards; between check-ins it runs fully offline. We may revoke a license obtained fraudulently or used in breach of this agreement. We intend to keep the license service running for as long as Orchestra is offered; if we ever discontinue it, we will provide a reasonable path for licensed copies to keep working.

## No warranty

Orchestra is provided **"as is"**. Websites change without notice, and an automation that works today can break tomorrow — we don't warrant that flows will keep running, that the software is error-free, or that it fits a particular purpose. Nothing in this section limits warranties that consumer law grants you and that cannot be waived.

## Limit of liability

To the extent the law allows, our total liability under this agreement is capped at **the amount you paid for your license**, and we are not liable for indirect or consequential damages — lost profits, lost data, or the cost of substitute services. Where consumer law grants you rights that cannot be limited, those rights prevail.

## Ending this agreement

If you materially breach this agreement, your license ends. You can end it yourself at any time by deleting your account. The sections on your ownership of exported work, warranty, and liability survive.

## Changes and contact

We may update this agreement for future versions of Orchestra; material changes will be announced on this page and the date below updated. This agreement is governed by the laws of Romania, without affecting mandatory consumer protections of the country you live in. Questions: [hello@orchestra-automation.com](mailto:hello@orchestra-automation.com).
`

export default function EulaPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-6 pb-24 pt-36">
        <h1 className="font-display text-4xl font-medium tracking-tight sm:text-5xl">End User License Agreement</h1>
        <p className="mt-3 text-sm text-muted">Last updated: July 17, 2026</p>
        <div className="mt-10">
          <Markdown text={EULA} />
        </div>
      </main>
      <Footer />
    </>
  )
}
