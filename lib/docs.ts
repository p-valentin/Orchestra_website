import fs from 'node:fs'
import path from 'node:path'

// Docs are markdown files in content/docs/, rendered statically at /docs/*.
// Unlike the blog (admin-authored, store-backed), docs ship with the repo.
// This manifest is the single source of truth for sections, ordering, the
// sidebar, prev/next chains, generateStaticParams and the sitemap — a stray
// .md file never becomes a page, and a missing one fails the build.

export interface DocsNavItem {
  slug: string[] // [] is the /docs index
  label: string // sidebar label; page titles live in frontmatter
}

export interface DocsSection {
  label: string
  items: DocsNavItem[]
}

export interface DocNavLink {
  href: string
  label: string
}

export interface Doc {
  title: string
  description: string
  body: string
  href: string
  sectionLabel: string
  prev: DocNavLink | null
  next: DocNavLink | null
}

export const docsSections: DocsSection[] = [
  {
    label: 'Getting started',
    items: [
      { slug: [], label: 'Introduction' },
      { slug: ['installation'], label: 'Installation' },
      { slug: ['quickstart'], label: 'Quickstart' },
      { slug: ['interface'], label: 'The interface' },
    ],
  },
  {
    label: 'Building flows',
    items: [
      { slug: ['recording'], label: 'Recording' },
      { slug: ['selectors'], label: 'Selectors' },
      { slug: ['variables'], label: 'Variables' },
      { slug: ['modifiers'], label: 'Step modifiers' },
      { slug: ['cues'], label: 'Cues & snippets' },
    ],
  },
  {
    label: 'Running & output',
    items: [
      { slug: ['running'], label: 'Running flows' },
      { slug: ['output-data'], label: 'Output & data' },
      { slug: ['workspaces'], label: 'Workspaces' },
    ],
  },
  {
    label: 'Code',
    items: [{ slug: ['code-export'], label: 'Code view & export' }],
  },
  {
    label: 'Instrument reference',
    items: [
      { slug: ['instruments', 'browser'], label: 'Browser' },
      { slug: ['instruments', 'forms'], label: 'Forms' },
      { slug: ['instruments', 'network'], label: 'Network' },
      { slug: ['instruments', 'data'], label: 'Data' },
      { slug: ['instruments', 'checks'], label: 'Checks' },
      { slug: ['instruments', 'flow'], label: 'Flow' },
      { slug: ['instruments', 'session-environment'], label: 'Session & environment' },
      { slug: ['instruments', 'advanced'], label: 'Advanced' },
    ],
  },
  {
    label: 'Reference',
    items: [
      { slug: ['shortcuts'], label: 'Keyboard shortcuts' },
      { slug: ['settings'], label: 'Settings & themes' },
    ],
  },
  {
    label: 'Help',
    items: [
      { slug: ['troubleshooting'], label: 'Troubleshooting' },
      { slug: ['faq'], label: 'FAQ' },
    ],
  },
]

export function docHref(slug: string[]): string {
  return slug.length ? `/docs/${slug.join('/')}` : '/docs'
}

interface FlatItem extends DocsNavItem {
  sectionLabel: string
}

const flatItems: FlatItem[] = docsSections.flatMap(section =>
  section.items.map(item => ({ ...item, sectionLabel: section.label })),
)

export function allDocParams(): { slug: string[] }[] {
  return flatItems.map(item => ({ slug: item.slug }))
}

// Same regex family as slugify in lib/blog.ts, reused for heading anchors.
export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
    .replace(/-+$/, '')
}

// Frontmatter is deliberately minimal: a leading --- block of `key: value`
// lines allowing exactly title and description. Content is author-controlled
// and parsed at build time, so every irregularity throws to fail the build.
function parseFrontmatter(raw: string, file: string): { title: string; description: string; body: string } {
  const text = raw.replace(/\r\n/g, '\n')
  if (!text.startsWith('---\n')) throw new Error(`${file}: missing frontmatter block`)
  const close = text.indexOf('\n---\n', 3)
  if (close === -1) throw new Error(`${file}: unclosed frontmatter block`)
  const fields: Record<string, string> = {}
  for (const line of text.slice(4, close).split('\n')) {
    if (!line.trim()) continue
    const colon = line.indexOf(':')
    const key = colon === -1 ? '' : line.slice(0, colon).trim()
    if (key !== 'title' && key !== 'description') {
      throw new Error(`${file}: unexpected frontmatter line "${line}"`)
    }
    fields[key] = line
      .slice(colon + 1)
      .trim()
      .replace(/^"(.*)"$/, '$1')
  }
  const { title, description } = fields
  if (!title || !description) throw new Error(`${file}: frontmatter must set title and description`)
  return { title, description, body: text.slice(close + 5).trim() }
}

export function getDocBySlug(slugPath: string[]): Doc | null {
  const key = slugPath.join('/')
  const index = flatItems.findIndex(item => item.slug.join('/') === key)
  const item = flatItems[index]
  if (!item) return null

  const relative = path.join('content', 'docs', `${key || 'index'}.md`)
  let raw: string
  try {
    raw = fs.readFileSync(path.join(process.cwd(), relative), 'utf8')
  } catch {
    throw new Error(`docs manifest entry "${docHref(slugPath)}" has no file at ${relative}`)
  }
  const { title, description, body } = parseFrontmatter(raw, relative)

  const link = (neighbor: FlatItem | undefined): DocNavLink | null =>
    neighbor ? { href: docHref(neighbor.slug), label: neighbor.label } : null

  return {
    title,
    description,
    body,
    href: docHref(slugPath),
    sectionLabel: item.sectionLabel,
    prev: link(flatItems[index - 1]),
    next: link(flatItems[index + 1]),
  }
}
