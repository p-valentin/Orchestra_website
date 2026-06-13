import ReactMarkdown, { type Components } from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'

const components: Components = {
  h1: ({ children }) => <h3 className="pt-2 font-display text-lg font-medium text-fg">{children}</h3>,
  h2: ({ children }) => <h3 className="pt-2 font-display text-lg font-medium text-fg">{children}</h3>,
  h3: ({ children }) => <h4 className="pt-2 font-display text-base font-medium text-fg">{children}</h4>,
  p: ({ children }) => <p className="text-[15px] leading-relaxed text-muted">{children}</p>,
  ul: ({ children }) => <ul className="flex flex-col gap-1.5 pl-5 list-disc marker:text-brass">{children}</ul>,
  ol: ({ children }) => <ol className="flex flex-col gap-1.5 pl-5 list-decimal marker:text-brass marker:font-mono">{children}</ol>,
  li: ({ children }) => <li className="text-[15px] leading-relaxed text-muted">{children}</li>,
  a: ({ children, href }) => (
    <a href={href} className="text-brass underline hover:text-brass-bright" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ children }) => <code className="rounded bg-line/60 px-1.5 py-0.5 font-mono text-[13px] text-fg">{children}</code>,
  pre: ({ children }) => <pre className="overflow-x-auto rounded-lg bg-line/60 p-3 font-mono text-[13px] text-fg">{children}</pre>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-brass/50 pl-3 text-[15px] leading-relaxed text-faint">{children}</blockquote>
  ),
  hr: () => <hr className="border-line" />,
}

export default function ReleaseNotes({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-3">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
}
