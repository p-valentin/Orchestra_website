import Shot from './Shot'

export default function CodeOwnership() {
  return (
    <section className="border-t border-line bg-panel/40">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-brass">No lock-in, ever</p>
          <h2 className="mt-4 font-display text-4xl font-medium leading-[1.05] tracking-tight sm:text-5xl">
            The output isn’t a workflow trapped in our cloud.
            <span className="block text-brass">It’s a file on your disk.</span>
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-muted">
            Every flow compiles — live, as you build — into plain Playwright. Export it as a
            standalone script or a packaged folder with its own <span className="font-mono text-[15px] text-fg">package.json</span>.
            If Orchestra disappeared tomorrow, every automation you built would keep running.
          </p>
        </div>

        <div className="mx-auto mt-14 max-w-3xl">
          <Shot
            src="/shots/code.png"
            alt="The Playwright code generated from a visual flow: inputs, navigation, assertions, extraction and screenshots — valid standalone Node.js."
            width={1520}
            height={1510}
            title="books-to-csv.js — generated & verified with node --check"
            caption="Generated Playwright, synced live with the visual flow. Runs in CI, cron, or a teammate’s terminal."
            sizes="(max-width: 1024px) 100vw, 768px"
          />
        </div>
      </div>
    </section>
  )
}
