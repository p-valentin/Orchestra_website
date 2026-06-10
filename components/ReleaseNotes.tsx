// Renders the plain-text notes format used in the admin: blank-line separated
// paragraphs, "- " bullets and "## " section headings. No markdown dependency.
export default function ReleaseNotes({ text }: { text: string }) {
  const blocks: React.ReactNode[] = []
  let bullets: string[] = []
  let key = 0

  const flush = () => {
    if (!bullets.length) return
    blocks.push(
      <ul key={key++} className="flex flex-col gap-1.5">
        {bullets.map((item, i) => (
          <li key={i} className="flex items-start gap-3 text-[15px] leading-relaxed text-muted">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brass" />
            {item}
          </li>
        ))}
      </ul>,
    )
    bullets = []
  }

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) { flush(); continue }
    if (line.startsWith('- ')) {
      bullets.push(line.slice(2))
      continue
    }
    flush()
    if (line.startsWith('## ')) {
      blocks.push(
        <h3 key={key++} className="pt-2 font-display text-lg font-medium text-fg">{line.slice(3)}</h3>,
      )
    } else {
      blocks.push(
        <p key={key++} className="text-[15px] leading-relaxed text-muted">{line}</p>,
      )
    }
  }
  flush()

  return <div className="flex flex-col gap-3">{blocks}</div>
}
