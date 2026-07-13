import ReactMarkdown, { type Components } from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'

// Article-scale markdown for blog posts. ReleaseNotes.tsx stays the compact
// variant for changelogs; this one keeps a real heading hierarchy (the page
// supplies the h1, so markdown # / ## both render as h2).

export const markdownComponents: Components = {
  h1: ({ children }) => <h2 className="pt-4 font-display text-2xl font-medium tracking-tight text-fg sm:text-3xl">{children}</h2>,
  h2: ({ children }) => <h2 className="pt-4 font-display text-2xl font-medium tracking-tight text-fg sm:text-3xl">{children}</h2>,
  h3: ({ children }) => <h3 className="pt-2 font-display text-xl font-medium text-fg">{children}</h3>,
  h4: ({ children }) => <h4 className="pt-1 font-display text-lg font-medium text-fg">{children}</h4>,
  p: ({ children }) => <p className="text-[16px] leading-relaxed text-muted">{children}</p>,
  ul: ({ children }) => <ul className="flex flex-col gap-2 pl-5 list-disc marker:text-brass">{children}</ul>,
  ol: ({ children }) => <ol className="flex flex-col gap-2 pl-5 list-decimal marker:text-brass marker:font-mono">{children}</ol>,
  li: ({ children }) => <li className="text-[16px] leading-relaxed text-muted">{children}</li>,
  a: ({ children, href }) => {
    const external = /^https?:\/\//.test(href ?? '')
    return (
      <a
        href={href}
        className="text-brass underline hover:text-brass-bright"
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {children}
      </a>
    )
  },
  strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  // Inline code gets a bordered chip; fenced blocks get a full-width well. The
  // [&_code] overrides strip the chip styling from the <code> react-markdown
  // nests inside every <pre>, so blocks don't end up double-boxed.
  code: ({ children }) => (
    <code className="rounded border border-line bg-well px-1.5 py-0.5 font-mono text-[13.5px] text-brass-bright">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-lg border border-line bg-well p-4 font-mono text-[13.5px] leading-relaxed text-fg sm:p-5 [&_code]:border-0 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-fg">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-brass/50 pl-4 text-[16px] leading-relaxed text-faint">{children}</blockquote>
  ),
  hr: () => <hr className="border-line" />,
  // Images/GIFs: host them on the public downloads bucket (or any same-origin
  // path) — the site CSP only allows img-src from self, data: and that host.
  img: ({ src, alt }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt ?? ''} loading="lazy" className="h-auto max-w-full rounded-lg border border-line" />
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[15px]">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-line-strong px-3 py-2 font-semibold text-fg">{children}</th>,
  td: ({ children }) => <td className="border-b border-line px-3 py-2 text-muted">{children}</td>,
}

export default function Markdown({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-4">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
        {text}
      </ReactMarkdown>
    </div>
  )
}
