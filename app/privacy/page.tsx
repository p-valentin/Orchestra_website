import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Markdown from '@/components/Markdown'

export const metadata: Metadata = {
  title: 'Privacy Policy — Orchestra',
  description: 'What Orchestra collects, why, and the rights you have over it.',
  alternates: { canonical: '/privacy' },
}

// Written to match what the product actually does — every claim here maps to
// code (Supabase auth, Paddle checkout, the entitlement/devices functions,
// Sentry with sendDefaultPii:false, the cookieless /api/hit beacon). If the
// product changes, change this page in the same PR.

const POLICY = `
Orchestra is a desktop app for browser automation, made by a small independent team. This page explains what data we handle when you use the app or this website, why we handle it, and what you can ask of us. Questions or requests: [hello@orchestra-automation.com](mailto:hello@orchestra-automation.com).

## Who we are

Orchestra is operated from Romania, and we are the data controller for the information described here. For any privacy or data-protection question, or to exercise the rights below, email [hello@orchestra-automation.com](mailto:hello@orchestra-automation.com).

## The short version

We collect what running a licensed product requires — your email, your license and device records, crash reports — and nothing aimed at tracking you. No advertising, no selling data, no analytics cookies. Payments are processed by Paddle; your card details never reach us.

## Your account

Creating an account stores your **email address** and a **hashed password** (we never see or store the plain password). Accounts live in Supabase, our database and authentication provider, hosted in the **EU (Frankfurt)**. Confirmation and password-reset emails are sent through Resend.

We use your account to attach your purchase, your trial, and your devices to you — the account *is* the license. Legal basis: performance of a contract.

## Purchases

Checkout is operated by **Paddle**, our merchant of record — the seller you buy from. Your card or payment details go to Paddle and never touch our servers. From each purchase we receive your **email address**, an **order reference**, and the **transaction status** (paid, refunded), which is what we need to create and maintain your license. Legal basis: performance of a contract.

## Licenses, trials, and devices

To enforce the 3-device limit and the 14-day trial, we keep:

- **License records** — your email, order reference, and status (active, refunded, revoked).
- **Device records** — a cryptographic one-way hash of a machine identifier (we cannot reverse it into anything about your hardware), a device name, the platform (Windows/macOS/Linux), the app version, and when the device last checked in.
- **Trial records** — start and end dates.

The app talks to our license server when you sign in and roughly **once a week** after that to renew its offline pass; between check-ins it runs fully offline. Our infrastructure sees your IP address transiently on those requests, as any server does. Legal basis: performance of a contract and legitimate interest in preventing abuse.

## Update checks

The app periodically asks \`downloads.orchestra-automation.com\` whether a newer version exists. That request reveals your **IP address, app version, and platform** — it is how any update check works and we don't build profiles from it. Legal basis: legitimate interest in shipping you security fixes.

## Crash reports

When the app crashes or hits an internal error, a report goes to **Sentry**: the stack trace, app version, and operating system. Reporting is configured **not** to attach IP addresses or user identifiers, and it does not include the contents of your flows. Crash reporting is on by default in current builds; an in-app switch to turn it off is planned. Until it ships, write to us and we'll help you disable it. Legal basis: legitimate interest in fixing bugs.

## This website

Analytics here are **cookieless**: a first-party counter records which page was viewed and, on your first page only, the domain you arrived from — no identifiers, no cookies, nothing tied to you. Vercel, our hosting provider, additionally reports aggregate, anonymized traffic. Signing in on the site keeps a session token in your browser's local storage until you sign out; we set no advertising or analytics cookies.

If you use the contact form or send feedback from the app, we receive what you wrote, your email if you provide it, and — for in-app bug reports — the diagnostic log attached to the report. It goes to our inbox and is kept only as long as the conversation needs.

## Service providers

We rely on a small number of trusted providers to run Orchestra. They process data only as needed to provide their service, never for their own purposes:

| Provider | Role | Where |
| --- | --- | --- |
| Supabase | Accounts, license database, license server | EU (Frankfurt) |
| Paddle | Merchant of record — payments, tax, refunds | UK/EU/US |
| Resend | Transactional email | US |
| Sentry | Crash reports | US |
| Vercel | Website hosting and aggregate analytics | Global edge |
| Cloudflare | App downloads and update checks | Global edge |

Providers outside the EU rely on Standard Contractual Clauses approved by the European Commission, together with data-processing agreements.

## Security

Your data is encrypted in transit (HTTPS everywhere) and encrypted at rest by our providers. Passwords are stored only as salted hashes and license tokens only as hashes — never in a form we could read back. Access to production systems is limited to what running the service requires. No system is perfectly secure, but we take reasonable measures to protect your data.

## How long we keep things

- **Account, license, and device data** — for as long as your account exists. Email us to delete your account; deletion currently happens manually, promptly, and copies in backups age out on our normal backup cycle.
- **Purchase records** — a minimal record of each transaction outlives account deletion, because tax and accounting law requires it and because it lets us honor your license if you ever come back.
- **Crash reports** — expire automatically after about 90 days.
- **Analytics** — aggregate counts only, holding no personal data.

## Your rights

If you're in the EU/UK (and in spirit, wherever you are): you can ask for a copy of your data, ask us to correct or delete it, object to a use of it, or take your data elsewhere. Email [hello@orchestra-automation.com](mailto:hello@orchestra-automation.com) and we'll act on it — normally within one month, as GDPR requires. You can also complain to your local data-protection authority.

## Legal requests

We may disclose information where the law requires it — for example, in response to a valid order from a court or public authority.

## Children

Orchestra isn't intended for children under 16, and we don't knowingly collect their data.

## Changes

If this policy changes in a way that matters, we'll say so on this page and, for significant changes, by email. The date below always reflects the current version.
`

export default function PrivacyPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-6 pb-24 pt-36">
        <h1 className="font-display text-4xl font-medium tracking-tight sm:text-5xl">Privacy Policy</h1>
        <p className="mt-3 text-sm text-muted">Last updated: July 17, 2026</p>
        <div className="mt-10">
          <Markdown text={POLICY} />
        </div>
      </main>
      <Footer />
    </>
  )
}
