// Keyword landing pages.
//
// Four static routes, one per query cluster the product genuinely serves. They
// are prerendered from this file rather than stored in R2 like blog posts,
// which means they are in the sitemap at build time, they survive storage being
// unreachable, and they are reviewable in a diff.
//
// A note on what these are NOT: doorway pages. Each one answers the question
// its query actually asks — what the thing is, how you'd do it, what the
// tradeoffs are — and only then says Orchestra does it. Four near-identical
// pages with the nouns swapped would be spam, and Google has been demoting that
// pattern since long before any of us started caring about it.

import type { FaqEntry } from './schema'

export interface LandingSection {
  heading: string
  body: string[]
  bullets?: { term: string; detail: string }[]
}

export interface LandingPage {
  slug: string
  /** <title>. Front-loaded with the query, brand last. */
  title: string
  description: string
  keywords: string[]
  h1: string
  lede: string
  sections: LandingSection[]
  faq: FaqEntry[]
  /** Internal links out. Every page links to at least two others. */
  related: { href: string; label: string }[]
}

export const LANDING_PAGES: LandingPage[] = [
  {
    slug: 'web-scraping',
    title: 'Web Scraping Tool — Extract Data Without Writing Code | Orchestra',
    description:
      'A desktop web scraping tool that runs on your machine. Point at a page, pick the fields, handle pagination and logins, then export clean JSON or CSV — or the Playwright code behind it.',
    keywords: [
      'web scraping',
      'web scraping tool',
      'scraping',
      'web scraper',
      'no code web scraping',
      'data extraction',
      'scrape website to csv',
    ],
    h1: 'Web scraping without writing the scraper',
    lede:
      'Orchestra is a desktop app for pulling structured data off websites. You point at what you want, it works out the selector, and you get JSON or CSV — plus the plain Playwright code underneath, so you are never locked in.',
    sections: [
      {
        heading: 'What makes web scraping hard is rarely the scraping',
        body: [
          'Fetching a page is easy. What costs the afternoon is everything around it: the site renders its table in JavaScript so the HTML you downloaded is empty, the results are paginated behind a button that only appears after scroll, the data you need is behind a login, and the selector you wrote breaks the following Tuesday because a class name changed.',
          'Orchestra runs a real browser, so JavaScript-rendered pages are simply pages. You record against the live site, and the steps you record are the steps that run.',
        ],
      },
      {
        heading: 'How extraction works',
        body: [
          'A scrape in Orchestra is a flow: a short list of visual steps you can read top to bottom.',
        ],
        bullets: [
          {
            term: 'Point and pick',
            detail:
              'Click an element in the live preview. Orchestra proposes a selector, shows you what it matches, and lets you loosen or tighten it before you commit.',
          },
          {
            term: 'Extract',
            detail:
              'Switch it to list mode, select one row, and it generalises to all of them — products, listings, table rows, search results — with each field named the way you want it in the output.',
          },
          {
            term: 'Each and pagination',
            detail:
              'Loop over rows, follow every detail link, or keep clicking "next" until the button stops existing. Nesting works, so a list of categories containing a list of products is two Each steps.',
          },
          {
            term: 'Output',
            detail: 'Write JSON or CSV wherever you want it. The shape is yours to name, not a dump of the DOM.',
          },
        ],
      },
      {
        heading: 'Logins, sessions and the things that block scrapers',
        body: [
          'Sites that need an account are the normal case, not the exception. Orchestra drives a real browser profile, so you sign in once the way a person would and the session persists across runs. There is no cookie-jar surgery and no reverse-engineering an auth flow.',
          'Because it is your machine and your browser, the traffic looks like what it is. That also means the responsibility is yours: read the terms of the site you are scraping, respect robots.txt and rate limits, and do not collect personal data you have no basis to hold.',
        ],
      },
      {
        heading: 'You keep the code',
        body: [
          'Every flow exports to plain Playwright — a readable JavaScript file with no Orchestra runtime, no SDK and no license check. Drop it in a repo, run it in CI, hand it to a developer, schedule it with cron.',
          'That is the difference between a tool and a dependency. If Orchestra vanished tomorrow, your scrapers would keep running.',
        ],
      },
    ],
    faq: [
      {
        question: 'Do I need to know how to code to scrape a website with Orchestra?',
        answer:
          'No. You build the flow visually by pointing at elements in a live browser preview. Code is the output, not the input — you can read and export the Playwright it generates, but you never have to write it.',
      },
      {
        question: 'Can it scrape JavaScript-heavy sites and single-page apps?',
        answer:
          'Yes. Orchestra drives a real browser, so anything a browser can render is scrapable — React, Vue, infinite scroll, content that only appears after an XHR completes. There is no separate "JS rendering" mode to enable.',
      },
      {
        question: 'What formats can I export the scraped data to?',
        answer:
          'JSON and CSV, with the field names and structure you define in the flow. You can also export the flow itself as plain Playwright code and write the output anywhere your own script chooses.',
      },
      {
        question: 'Does the scraper run in the cloud?',
        answer:
          'No. Orchestra is a desktop application and runs entirely on your own machine, on Windows, macOS or Linux. Nothing you scrape passes through our servers, because there are no servers in the path.',
      },
      {
        question: 'How much does it cost?',
        answer:
          'There is a 14-day free trial with every feature unlocked and no card required. After that it is $149 once — a one-time purchase, not a subscription, with no per-run or per-page charges.',
      },
    ],
    related: [
      { href: '/web-automation', label: 'Browser automation beyond scraping' },
      { href: '/playwright-alternative', label: 'How it compares to writing Playwright by hand' },
      { href: '/docs/instruments/data', label: 'Docs: Extract' },
    ],
  },

  {
    slug: 'web-automation',
    title: 'Web Automation Tool for Mac, Windows and Linux | Orchestra',
    description:
      'Automate any website from your desktop. Record the steps, watch them run in a real browser, and export plain Playwright you own. One-time price, no cloud, no subscription.',
    keywords: [
      'web automation',
      'web automation tool',
      'browser automation',
      'automate website',
      'automation tool',
      'desktop automation',
      'automate any website',
    ],
    h1: 'A web automation tool that leaves you owning the automation',
    lede:
      'Orchestra builds browser automations from visual steps, runs them in a real browser in front of you, and exports plain Playwright code. It works on any website — including the ones with no API.',
    sections: [
      {
        heading: 'When there is no API, the browser is the API',
        body: [
          'Plenty of the software a business depends on offers no integration worth the name: an internal admin panel, a supplier portal, a government filing site, a CRM whose export button produces the wrong columns. The work is real and repetitive, and the only interface is the one a person clicks.',
          'Browser automation closes that gap. If you can do it in a browser, you can automate it — no vendor cooperation required.',
        ],
      },
      {
        heading: 'Build it by doing it once',
        body: [
          'Turn on recording and work through the task normally. Orchestra watches the clicks, the typing, the navigation and the waiting, and writes them down as steps you can then edit, reorder, parameterise and branch.',
        ],
        bullets: [
          {
            term: 'See it run',
            detail:
              'The browser is right there. You watch each step highlight as it executes, so a failure shows you the page it failed on rather than a stack trace.',
          },
          {
            term: 'Real control flow',
            detail:
              'Conditions, loops, try/catch and assertions — the things that turn a recorded macro into something that survives a slow page or a missing row.',
          },
          {
            term: 'Variables and inputs',
            detail: 'Drive a flow from a CSV, a prompt, or the output of an earlier step. One flow, many rows.',
          },
          {
            term: 'Runs offline',
            detail:
              'Everything executes locally. No queue, no worker pool, no per-run billing, and nothing about your automation leaves the machine.',
          },
        ],
      },
      {
        heading: 'What people automate with it',
        body: [
          'Data entry from a spreadsheet into a web form, hundreds of rows without a typo. Price and stock checks against suppliers on a schedule. Pulling a weekly report out of a dashboard that only offers a screen. Smoke tests that click the critical path and assert what must be true, exported as Playwright so CI can run them on every deploy.',
        ],
      },
      {
        heading: 'Export, and stop depending on us',
        body: [
          'Every flow exports as plain Playwright JavaScript — no runtime library, no license check, no proprietary format. Put it in version control, run it on a server, give it to a developer to extend.',
          'Most automation tools make leaving expensive on purpose. This one hands you the code as a feature.',
        ],
      },
    ],
    faq: [
      {
        question: 'What is web automation?',
        answer:
          'Web automation is having software drive a web browser the way a person would — clicking, typing, navigating and reading pages — so that repetitive work on a website happens without someone doing it by hand. It is the practical option when a site offers no API.',
      },
      {
        question: 'Can Orchestra automate a website that has no API?',
        answer:
          'Yes, that is the main case it is built for. It drives a real browser against the live site, so anything you can do manually in a browser can be turned into a flow, whether or not the vendor offers an integration.',
      },
      {
        question: 'Which operating systems does it run on?',
        answer: 'Windows, macOS and Linux. It is a desktop application, and one license covers up to three devices.',
      },
      {
        question: 'Do my automations stop working if I stop paying?',
        answer:
          'No. It is a one-time $149 purchase rather than a subscription, and every flow can be exported as standalone Playwright code that runs with no connection to Orchestra at all.',
      },
      {
        question: 'Is it a no-code tool or a developer tool?',
        answer:
          'Both, deliberately. You build flows visually without writing code, and the code it generates is plain, readable Playwright rather than a black box — so a non-developer can build the automation and a developer can take it further.',
      },
    ],
    related: [
      { href: '/web-scraping', label: 'Using it for data extraction' },
      { href: '/web-rpa', label: 'Web RPA without the enterprise contract' },
      { href: '/docs/quickstart', label: 'Docs: Quickstart' },
    ],
  },

  {
    slug: 'web-rpa',
    title: 'Web RPA Software — Robotic Process Automation for Websites | Orchestra',
    description:
      'Web RPA without the enterprise contract. Automate browser-based processes on your own desktop, export the code, and pay once instead of per bot per year.',
    keywords: [
      'web rpa',
      'rpa',
      'robotic process automation',
      'rpa software',
      'rpa tool',
      'browser rpa',
      'rpa alternative',
    ],
    h1: 'Web RPA, without the enterprise contract',
    lede:
      'Robotic process automation for the part of the process that lives in a browser — built on your desktop, priced once, and exportable as code you own rather than a licence you rent.',
    sections: [
      {
        heading: 'What web RPA actually means',
        body: [
          'RPA is software that performs the interface work a person would otherwise do: opening the system, finding the record, copying the value, filling the form, submitting it. "Web" RPA is the subset where that interface is a website — which, for most organisations now, is nearly all of it.',
          'The classic RPA platforms grew up automating Windows desktops and treat the browser as one more surface. If your processes are browser-shaped, most of what you are licensing is weight you never use.',
        ],
      },
      {
        heading: 'Where traditional RPA gets expensive',
        body: [
          'The licence is rarely the whole cost. Bots are priced per unit per year, orchestration runs on servers somebody maintains, and the flows are stored in a proprietary format that only the vendor’s runtime executes. Three years in, the automations are real assets and none of them are portable.',
        ],
        bullets: [
          {
            term: 'Per-bot pricing',
            detail: 'Recurring, per unit, and it scales with the number of processes you automate — precisely the wrong direction.',
          },
          {
            term: 'Server-side orchestration',
            detail: 'Infrastructure to run, secure and upgrade, before a single process is automated.',
          },
          {
            term: 'Proprietary flow formats',
            detail: 'The logic exists only inside the vendor’s tool, so migrating means rebuilding.',
          },
          {
            term: 'Long implementations',
            detail: 'Specialist consultants to automate a task somebody in the team could describe in five minutes.',
          },
        ],
      },
      {
        heading: 'The desktop alternative',
        body: [
          'Orchestra puts the same capability on the machine of the person who understands the process. They record the task, correct it where the recording guessed wrong, add the conditions and retries that make it survive a slow morning, and run it.',
          'When a process outgrows the desktop, export it: the flow becomes plain Playwright JavaScript that a developer can schedule, containerise or wire into an existing pipeline. The upgrade path out of the tool is a feature, not an escape hatch nobody tells you about.',
        ],
      },
      {
        heading: 'Where it fits, and where it does not',
        body: [
          'It fits browser-based processes: portals, dashboards, admin panels, forms, supplier and government sites, anything with a login and a screen. It is a good fit for teams who want to automate a dozen real processes without a platform decision.',
          'It is not a fit if you need to automate native Windows desktop applications, mainframe terminal emulators, or a centrally-orchestrated fleet of unattended bots with enterprise governance and audit workflows. Those are what the big platforms are for, and they earn their price there.',
        ],
      },
    ],
    faq: [
      {
        question: 'What is web RPA?',
        answer:
          'Web RPA is robotic process automation applied to browser-based systems: software that logs in, navigates, reads and fills in websites to complete a business process without a person doing it manually. It is used where systems offer a web interface but no usable API.',
      },
      {
        question: 'How is Orchestra different from traditional RPA platforms?',
        answer:
          'It runs on your desktop rather than on orchestration servers, it is a one-time $149 purchase rather than per-bot annual licensing, and every process exports as plain Playwright code you own instead of a proprietary flow format only the vendor can execute.',
      },
      {
        question: 'Can it handle attended and unattended processes?',
        answer:
          'Attended runs work directly in the app. For unattended and scheduled runs, export the flow as Playwright and run it with your own scheduler, server or CI system — which also means those runs cost you nothing extra.',
      },
      {
        question: 'Does it work with systems that have no API?',
        answer:
          'Yes. That is the point of RPA generally and of this tool specifically: it drives the browser interface, so vendor cooperation is not required.',
      },
      {
        question: 'What about native desktop or mainframe automation?',
        answer:
          'Orchestra automates the browser only. If your processes involve native Windows applications or terminal emulators, a full RPA platform is the right tool and we would rather say so than sell you the wrong thing.',
      },
    ],
    related: [
      { href: '/web-automation', label: 'The general web automation case' },
      { href: '/web-scraping', label: 'Extracting data as part of a process' },
      { href: '/docs/instruments/browser', label: 'Docs: the step reference' },
    ],
  },

  {
    slug: 'playwright-alternative',
    title: 'Visual Playwright Builder — Record, Run and Export Real Code | Orchestra',
    description:
      'Build Playwright automations visually and export plain JavaScript with no runtime lock-in. A faster way to write Playwright, not a replacement for it.',
    keywords: [
      'playwright',
      'playwright alternative',
      'no code playwright',
      'visual playwright',
      'playwright codegen alternative',
      'playwright gui',
      'record playwright test',
    ],
    h1: 'A visual way to build Playwright — and plain Playwright on the way out',
    lede:
      'Orchestra is not a replacement for Playwright. It is a studio that builds flows visually and exports them as ordinary Playwright JavaScript, so the fast path and the portable path are the same path.',
    sections: [
      {
        heading: 'Playwright is excellent. Writing it is still slow.',
        body: [
          'Nobody sensible argues with Playwright as a runtime — it is fast, it is reliable, and its auto-waiting removed a whole genre of flaky test. The cost is upstream of that: finding a selector that will still match next month, restructuring around a loop, re-running the file to discover the page moved on, and doing all of it in an editor while the actual page lives in another window.',
          '`playwright codegen` helps and then stops helping. It emits a linear transcript of what you did, with no loops, no conditions and no structure — useful as a starting point, awkward as a thing to maintain.',
        ],
      },
      {
        heading: 'What a visual builder changes',
        body: [
          'Orchestra keeps the page and the flow side by side. You click an element and see immediately what the proposed selector matches and how many things it matches, which is the moment selector bugs are cheapest to fix.',
        ],
        bullets: [
          {
            term: 'Structure while you record',
            detail:
              'Loops, conditions, try/catch and assertions are steps you add as you go, not a refactor you perform afterwards on generated code.',
          },
          {
            term: 'Run any step in isolation',
            detail: 'Re-run one step against the current page state instead of re-executing the file from the top each time.',
          },
          {
            term: 'Selectors you can interrogate',
            detail: 'See the matches highlighted, then loosen or tighten before committing — rather than finding out at run time.',
          },
          {
            term: 'Readable export',
            detail:
              'The output is JavaScript a person would write: named steps, real Playwright locators, JSDoc types for editor autocomplete, no Orchestra imports and no runtime to install.',
          },
        ],
      },
      {
        heading: 'No lock-in, by construction',
        body: [
          'The exported file has no dependency on Orchestra. No SDK, no licence check, no proprietary format, nothing that phones home. It is a Playwright script — `npx playwright test` runs it, CI runs it, a developer who has never heard of this app can read and extend it.',
          'So the question is never "can we get our automations out". They were always out.',
        ],
      },
      {
        heading: 'When to use which',
        body: [
          'If your team writes Playwright comfortably and lives in the editor, keep doing that — Playwright is the better tool for people who are already fluent in it, and this page is not going to pretend otherwise.',
          'Orchestra earns its place when the person who understands the process is not the person who writes TypeScript, when you want a working automation this afternoon rather than this week, or when you want the two to collaborate on one artifact: built visually, handed over as code.',
        ],
      },
    ],
    faq: [
      {
        question: 'Is Orchestra a replacement for Playwright?',
        answer:
          'No. It is a visual builder that generates Playwright. The code it exports uses Playwright as its runtime, so you are adopting Playwright, not avoiding it.',
      },
      {
        question: 'How is this different from Playwright codegen?',
        answer:
          'Codegen records a linear transcript of your actions with no loops, conditions or error handling, and stops there. Orchestra lets you build structure as you record, re-run individual steps, inspect what a selector matches before committing to it, and edit the flow afterwards.',
      },
      {
        question: 'Is the exported code actually readable?',
        answer:
          'Yes — plain JavaScript (CommonJS or ESM) with real Playwright locators and named steps, with no Orchestra imports, no SDK and no licence check. It is meant to be handed to a developer and extended by hand.',
      },
      {
        question: 'Can I run the exported code in CI?',
        answer:
          'Yes. It is an ordinary Playwright script with no dependency on Orchestra, so it runs anywhere Playwright runs — GitHub Actions, GitLab CI, a container, a cron job on a server.',
      },
      {
        question: 'Do I need Playwright installed to use Orchestra?',
        answer:
          'Not to build and run flows inside the app — Orchestra ships its own browser runtime. You need Playwright only when you take the exported code elsewhere and run it yourself.',
      },
    ],
    related: [
      { href: '/web-automation', label: 'The broader automation case' },
      { href: '/web-scraping', label: 'Scraping with the same flows' },
      { href: '/docs/code-export', label: 'Docs: Code export' },
    ],
  },
]

export function landingPage(slug: string): LandingPage | undefined {
  return LANDING_PAGES.find(page => page.slug === slug)
}
