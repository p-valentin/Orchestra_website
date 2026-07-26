import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Markdown from '@/components/Markdown'

export const metadata: Metadata = {
  title: 'Acceptable Use Policy — Orchestra',
  description: 'What we expect from you when you automate with Orchestra: respect the sites you automate, get permission where it is needed, and follow the law.',
  alternates: { canonical: '/acceptable-use' },
}

// The EULA's "Automation is your responsibility" section, expanded into a page
// of its own and linked from it. Same substance, stated plainly: Orchestra runs
// on the customer's machine, so what it does is the customer's call and the
// customer's responsibility.

const POLICY = `
Orchestra runs on your machine and does what you tell it to. This page sets out what we expect from you when you use it. It sits alongside the [EULA](/eula) and the [Privacy Policy](/privacy), and forms part of your agreement with us.

## Your automations are your responsibility

Orchestra automates real browsers on websites we don't control. Which sites your flows visit, how often they run, what they click and what they collect — all of that is your decision, and the responsibility for it is yours. We provide the instrument; you conduct.

## Respect the sites you automate

Follow the terms of service of every site and service you automate, and stay inside their rate limits. Don't overload a server, don't work around access controls or authentication you aren't meant to pass, and don't use Orchestra to reach anything you aren't entitled to reach. Where a site publishes robots conventions, respect them.

## Get permission where it's needed

If a site or service requires permission, an API agreement, or an account of a particular kind before you automate it, obtaining that is on you, before you start.

## Follow the law, including privacy law

Comply with the laws that apply to you and to anything your automations do or collect. Personal data needs particular care: if your flows collect information about identifiable people, you are the controller of that data. Data-protection law — GDPR in the EU and UK, and its equivalents elsewhere — applies to you, not to us. Have a lawful basis, collect only what you actually need, and honor the rights of the people the data is about.

## What Orchestra is and isn't

Orchestra is a desktop application. It runs on your computer, under your control:

- **We don't run your automations.** Nothing you build executes on our servers.
- **We don't receive or host the data your flows collect.** It stays on your machine, and exported Playwright code runs without us entirely.
- **We don't resell data, sell access to any website, or supply proxies, accounts or credentials.**

Our servers do three things: accounts, licenses, and update checks. That's the whole list — see the [Privacy Policy](/privacy) for the detail.

## If this is breached

We may suspend or revoke a license used in breach of this policy or the EULA. In practice we'd far rather send you an email first and sort it out.

## Contact

Questions, or something here you're not sure how to apply: [hello@orchestra-automation.com](mailto:hello@orchestra-automation.com).
`

export default function AcceptableUsePage() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-6 pb-24 pt-36">
        <h1 className="font-display text-4xl font-medium tracking-tight sm:text-5xl">Acceptable Use Policy</h1>
        <p className="mt-3 text-sm text-muted">Last updated: July 26, 2026</p>
        <div className="mt-10">
          <Markdown text={POLICY} />
        </div>
      </main>
      <Footer />
    </>
  )
}
