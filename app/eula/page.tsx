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
// license, 3 device slots, 14-day trial, frequent online re-checks with a
// 7-day offline pass, exported code owned by the user, refund → revocation
// via Paddle.
//
// Seller of record for the SALE is Paddle (see "Buying, taxes, refunds"). The
// software licensor here is Pirva Valentin, an individual in Romania.
// NOTE(owner): a geographic contact address is still best practice under EU
// consumer law — add one to the intro line (and the privacy page) when
// available.

const EULA = `
This agreement is between you and **Pirva Valentin**, an individual based in Romania, trading as **Orchestra Automation** ([orchestra-automation.com](https://orchestra-automation.com), "we"), and covers the Orchestra desktop application and its related services. By installing, accessing, or using Orchestra, you agree to be bound by it. If you don't accept it, don't use the software.

## The license you get

When you buy Orchestra, we grant you a **perpetual, non-exclusive, non-transferable license**, subject to this agreement, to install and use the current product for your own purposes — personal or business. Concretely:

- **One account per person.** Your account is your license; there is no separate license key.
- **Up to 3 devices** activated at once. You can remove a device from your account page at any time to free its slot. We may adjust device-activation limits to prevent abuse while preserving reasonable personal use — and for licenses already purchased, never below the 3 slots you bought with.
- **One payment, no subscription.** The price includes future updates and improvements for as long as Orchestra continues to be commercially offered.
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

Orchestra automates real browsers on websites we don't control. **You** are responsible for what your automations do: respecting the terms and rate limits of the sites you automate, and complying with the laws that apply to you and to any data you collect — including privacy laws when scraping personal data. You are solely responsible for obtaining any permission required for the websites or services you automate. We provide the instrument; you conduct.

## Buying, taxes, refunds

Orchestra is sold through **Paddle**, our merchant of record — Paddle is the seller of record for your purchase and their buyer terms apply at checkout. Prices are in USD; any tax is calculated and added by Paddle at checkout. Refunds are handled through Paddle, and refund eligibility is determined by Paddle's applicable policies. If you are a consumer in the EU or UK, nothing here limits your statutory 14-day right of withdrawal for digital purchases — ask Paddle or us within that window and it will be honored. **A refunded or charged-back purchase deactivates its license.**

## Staying licensed

The app confirms your license with our servers when you sign in, and while it is online it quietly re-confirms every few minutes. Each successful check issues an offline pass good for **7 days**, so without a connection the app keeps working for up to 7 days at a time. We may revoke a license obtained fraudulently or used in breach of this agreement. If we ever permanently discontinue the license service, we will make commercially reasonable efforts to provide a way for licensed users to keep using the software.

## No warranty

Orchestra is provided **"as is"**. Websites change without notice, and an automation that works today can break tomorrow — we don't warrant that flows will keep running, that the software is error-free, or that it fits a particular purpose. Nothing in this section limits warranties that consumer law grants you and that cannot be waived.

## Limit of liability

To the extent the law allows, our total liability under this agreement is capped at **the amount you paid for your license**, and we are not liable for indirect or consequential damages — lost profits, lost data, or the cost of substitute services. This cap does not apply to damage caused intentionally or through gross negligence, or to any other liability the law does not let us limit. Where consumer law grants you rights that cannot be limited, those rights prevail.

## Ending this agreement

If you materially breach this agreement, your license ends and you must stop using the software. You can end this agreement yourself at any time by deleting your account. The sections on your ownership of exported work, warranty, and liability survive.

## Third-party and open-source software

Orchestra includes third-party open-source components, each governed by its own license; those licenses continue to apply to those components, and the list of components with their license texts is included with the app's installation.

## Export and sanctions

You may not use Orchestra in violation of applicable export-control laws or sanctions, or in any country or by any party that such laws prohibit.

## Events outside our control

We aren't liable for any failure or delay caused by events beyond our reasonable control — including outages at our infrastructure providers, network failures, or other force-majeure events.

## The whole agreement

This is the entire agreement between you and us about Orchestra, and it replaces any earlier understanding. If any part is found unenforceable, the rest stays in force.

## Changes and contact

We may update this agreement for future versions of Orchestra; material changes will be announced on this page and the "Last updated" date at the top of this page updated. Material changes apply going forward and do not retroactively remove rights already granted, unless the law requires otherwise. This agreement is governed by the laws of Romania, without affecting mandatory consumer protections of the country you live in. Questions: [hello@orchestra-automation.com](mailto:hello@orchestra-automation.com).
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
