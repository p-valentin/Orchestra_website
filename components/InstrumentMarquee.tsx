const ROW_A = [
  'Navigate', 'Click', 'Fill', 'Extract', 'Extract List', 'Screenshot', 'Download', 'Scroll', 'Select',
  'Upload', 'Keyboard', 'Fetch', 'Intercept', 'Assert', 'Assert URL', 'Wait', 'Wait Network',
  'Switch Tab', 'Close Tab', 'Dialog Handler', 'Go Back', 'Reload',
]

const ROW_B = [
  'Condition', 'Each', 'While', 'Try / Catch', 'Cue', 'Group', 'Snippet', 'Value', 'Output',
  'Transform', 'Evaluate', 'Script', 'Set Headers', 'Move Mouse', 'Pause', 'Sleep',
  'Stop', 'Success', 'Fail', 'Comment', 'Frame',
]

function Row({ items, reverse }: { items: string[]; reverse?: boolean }) {
  const doubled = [...items, ...items]
  return (
    <div className="marquee-mask overflow-hidden">
      <div className={`flex w-max gap-3 ${reverse ? 'animate-marquee-rev' : 'animate-marquee'}`}>
        {doubled.map((name, i) => (
          <span
            key={`${name}-${i}`}
            className="whitespace-nowrap rounded-md border border-line bg-panel px-3.5 py-1.5 font-mono text-xs text-muted"
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function InstrumentMarquee() {
  return (
    <section aria-label="The 44 instruments" className="border-y border-line py-10">
      <p className="mb-7 text-center font-mono text-xs uppercase tracking-[0.18em] text-faint">
        44 instruments · the full Playwright surface, one step at a time
      </p>
      <div className="flex flex-col gap-3">
        <Row items={ROW_A} />
        <Row items={ROW_B} reverse />
      </div>
    </section>
  )
}
