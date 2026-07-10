import type { Element } from 'hast'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { markdownComponents } from '@/components/Markdown'
import { slugifyHeading } from '@/lib/docs'

// Docs variant of Markdown.tsx: same visual language plus stable ids and
// hover anchors on headings so reference sections deep-link (…#screenshot).
// remark-breaks is deliberately absent — docs are hand-authored with
// soft-wrapped source lines that must not become <br>.

function hastText(node: Element | undefined): string {
  if (!node) return ''
  let out = ''
  for (const child of node.children) {
    if (child.type === 'text') out += child.value
    else if (child.type === 'element') out += hastText(child)
  }
  return out
}

export default function DocsMarkdown({ text }: { text: string }) {
  // Fresh per render so duplicate headings dedup within a page, never across.
  const used = new Map<string, number>()
  const headingId = (node: Element | undefined): string => {
    const base = slugifyHeading(hastText(node)) || 'section'
    const n = (used.get(base) ?? 0) + 1
    used.set(base, n)
    return n === 1 ? base : `${base}-${n}`
  }
  const anchor = (id: string) => (
    <a
      href={`#${id}`}
      aria-label="Link to section"
      className="ml-2 font-mono text-brass opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
    >
      #
    </a>
  )

  const components: Components = {
    ...markdownComponents,
    h1: ({ children, node }) => {
      const id = headingId(node)
      return (
        <h2 id={id} className="group scroll-mt-24 pt-4 font-display text-2xl font-medium tracking-tight text-fg sm:text-3xl">
          {children}
          {anchor(id)}
        </h2>
      )
    },
    h2: ({ children, node }) => {
      const id = headingId(node)
      return (
        <h2 id={id} className="group scroll-mt-24 pt-4 font-display text-2xl font-medium tracking-tight text-fg sm:text-3xl">
          {children}
          {anchor(id)}
        </h2>
      )
    },
    h3: ({ children, node }) => {
      const id = headingId(node)
      return (
        <h3 id={id} className="group scroll-mt-24 pt-2 font-display text-xl font-medium text-fg">
          {children}
          {anchor(id)}
        </h3>
      )
    },
  }

  return (
    <div className="flex flex-col gap-4">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
}
