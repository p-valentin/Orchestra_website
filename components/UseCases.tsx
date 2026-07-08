const CASES = [
  {
    title: 'Web scraping & data extraction',
    body: 'Pull products, listings, articles or tables into clean JSON / CSV — with loops, pagination and stealth built in.',
    tools: 'Extract List · Each · Output',
  },
  {
    title: 'Price & stock monitoring',
    body: 'Check competitors or suppliers on a schedule. Export the script, drop it in cron, get a CSV every morning.',
    tools: 'Navigate · Extract · Condition',
  },
  {
    title: 'Form filling & data entry',
    body: 'Feed a CSV of rows into any web form. The flow types, selects, uploads and submits — hundreds of times, without typos.',
    tools: 'Value · Fill · Upload · Each',
  },
  {
    title: 'QA smoke tests',
    body: 'Click through your critical paths and assert what must be true. Export real Playwright your CI can run on every deploy.',
    tools: 'Assert · Assert URL · Try/Catch',
  },
  {
    title: 'Lead lists & research',
    body: 'Walk directories and profiles, collect names, links and details into a spreadsheet your sales team can actually use.',
    tools: 'Extract List · Transform · Output',
  },
  {
    title: 'Back-office routines',
    body: 'The weekly report download, the invoice portal, the dashboard export — the clicks you do half-asleep, done for you.',
    tools: 'Navigate · Click · Screenshot',
  },
]

export default function UseCases() {
  return (
    <section id="uses" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-brass">Use cases</p>
      <h2 className="mt-4 max-w-2xl font-display text-4xl font-medium leading-[1.05] tracking-tight sm:text-5xl">
        If it happens in a browser, you can hand it to Orchestra.
      </h2>

      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {CASES.map((c) => (
          <div
            key={c.title}
            className="flex flex-col rounded-xl border border-line bg-panel p-7 transition-colors hover:border-brass/40"
          >
            <h3 className="font-display text-xl font-medium tracking-tight">{c.title}</h3>
            <p className="mt-3 flex-1 text-[15px] leading-relaxed text-muted">{c.body}</p>
            <p className="mt-5 font-mono text-[11px] text-brass-dim">{c.tools}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
