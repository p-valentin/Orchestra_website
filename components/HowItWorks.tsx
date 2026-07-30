const STEPS = [
  {
    n: '01',
    title: 'Compose your flow',
    body: 'Pick from the instrument palette — navigate, click, extract, loop, branch. Point at any element in the embedded browser to grab its selector. No code, no boilerplate.',
  },
  {
    n: '02',
    title: 'Watch it perform',
    body: 'Run the flow and watch every step execute live: timings, extracted values, variable changes. When something breaks, you see exactly where and why — in plain English.',
  },
  {
    n: '03',
    title: 'Keep the score',
    body: 'Every flow compiles to real Playwright. Export a standalone script or a packaged folder and run it in CI, a cron job, or on a teammate’s machine. It’s yours, forever.',
  },
]

export default function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-brass">How it works</p>
      <h2 className="mt-4 max-w-2xl font-display text-4xl font-medium leading-[1.05] tracking-tight sm:text-5xl">
        From repetitive chore to running script in minutes.
      </h2>

      <div className="mt-14 grid gap-px overflow-hidden rounded-xl border border-line bg-[rgba(243,238,226,0.08)] md:grid-cols-3">
        {STEPS.map((step) => (
          <div key={step.n} className="bg-panel p-8">
            <span className="font-mono text-sm text-brass">{step.n}</span>
            <h3 className="mt-4 font-display text-2xl font-medium tracking-tight">{step.title}</h3>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">{step.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
