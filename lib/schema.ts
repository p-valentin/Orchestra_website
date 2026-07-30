// JSON-LD builders, in one place so the entity ids stay consistent.
//
// Every schema that mentions the publisher points at ORGANIZATION_ID rather
// than repeating an inline Organization object. Google merges nodes by @id, so
// one canonical definition on the homepage plus references elsewhere describes
// a single entity — where several inline copies describe several, and none of
// them accrue authority.

import { SITE_URL } from './site'

export const ORGANIZATION_ID = `${SITE_URL}/#organization`

export interface FaqEntry {
  question: string
  answer: string
}

export function organizationSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORGANIZATION_ID,
    name: 'Orchestra Automation',
    alternateName: 'Orchestra',
    url: SITE_URL,
    logo: `${SITE_URL}/opengraph-image`,
    description:
      'Orchestra is a desktop studio for browser automation, web scraping and web RPA. Build flows visually, watch them run in a real browser, and export plain Playwright code you own.',
    founder: { '@type': 'Person', name: 'Pirva Valentin' },
    email: 'hello@orchestra-automation.com',
    // The legal seller of record, matching the EULA and refund policy.
    address: { '@type': 'PostalAddress', addressCountry: 'RO' },
  }
}

// Breadcrumbs for the docs tree. The trail is already rendered visually; this
// is the same information in the form a crawler can use, which is what turns a
// deep docs URL into a result with a readable path instead of a bare link.
export function breadcrumbSchema(trail: { name: string; path: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: `${SITE_URL}${crumb.path}`,
    })),
  }
}

// Pulls `## Question` / paragraph pairs out of a docs markdown body.
//
// Derived rather than duplicated: the FAQ answers already exist in
// content/docs/faq.md, and a second hand-maintained copy for the crawler would
// drift from the one humans read — which is exactly the situation structured
// data is supposed to avoid.
export function faqFromMarkdown(body: string): FaqEntry[] {
  const entries: FaqEntry[] = []
  // Split on level-2 headings, keeping the heading text as the delimiter.
  const chunks = body.split(/^##\s+/m).slice(1)
  for (const chunk of chunks) {
    const newline = chunk.indexOf('\n')
    if (newline === -1) continue
    const question = chunk.slice(0, newline).trim()
    const answer = plainText(chunk.slice(newline + 1))
    if (question && answer) entries.push({ question, answer })
  }
  return entries
}

// Markdown → the prose underneath it. Google wants answer text, and shipping
// raw `[label](/href)` syntax into a rich result reads as broken.
function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .split(/\n{2,}/)[0]!
    .replace(/\s+/g, ' ')
    .trim()
}

export function faqSchema(entries: FaqEntry[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.map(entry => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer },
    })),
  }
}

// One <script> per page holding an array. Next escapes nothing here, so every
// value that reaches this function must be ours — never user input, never a
// blog body. JSON.stringify plus the </script> guard below is the whole
// defence, and it only holds because the inputs are authored, not submitted.
export function jsonLdScript(schemas: Record<string, unknown>[]): string {
  return JSON.stringify(schemas).replace(/</g, '\\u003c')
}
