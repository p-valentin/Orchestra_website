import Shot from './Shot'

type Split = {
  eyebrow: string
  title: string
  body: string
  points: string[]
  shot: { src: string; width: number; height: number; alt: string; title: string; caption: string }
  flip?: boolean
}

const SPLITS: Split[] = [
  {
    eyebrow: 'The instruments',
    title: 'Every step readable. Every step yours.',
    body: 'Build with the full Playwright surface — organised into instruments you can read like a checklist. Drag to reorder, click between steps to insert, group and reuse as snippets.',
    points: [
      'Point-and-click selector picker in the embedded browser',
      'Conditions, loops, try/catch — without writing a line',
      'Live preview shows what a step would do right now',
    ],
    shot: {
      src: '/shots/instruments.png',
      width: 383,
      height: 864,
      alt: 'An Orchestra flow with Set Headers, Navigate, Assert URL, groups, cues, conditions and loops — each step showing its live run time.',
      title: 'flow.orchestra',
      caption: 'A real flow — every step timed and traced as it runs.',
    },
  },
  {
    eyebrow: 'X-ray debugging',
    title: 'When it breaks, you look — you don’t guess.',
    body: 'Orchestra tracks every variable as the run unfolds: where it came from, which step set it, what it became. Failures produce plain-English errors and an automatic snapshot of the page.',
    points: [
      'Live variable timeline with provenance',
      'Per-step input / output inspector',
      'Auto-screenshot + page state on failure',
    ],
    shot: {
      src: '/shots/variables.png',
      width: 709,
      height: 839,
      alt: 'Orchestra’s Variables panel: initial inputs, temporary variables tagged with the step that set them, and a timestamped change history.',
      title: 'variables.orchestra',
      caption: 'Initial inputs, temporary values, and a full change history.',
    },
    flip: true,
  },
  {
    eyebrow: 'Cues',
    title: 'The web is messy. Your flow doesn’t care.',
    body: 'A Cue watches the page and fires the moment its condition matches — cookie banners, login walls, late-loading content. The chaos gets handled; your main flow stays clean.',
    points: [
      'Fires automatically, the instant the page matches',
      'Perfect for banners, modals and A/B noise',
      'Nested cues — handlers that arm only inside the step that needs them',
    ],
    shot: {
      src: '/shots/cue.png',
      width: 516,
      height: 829,
      alt: 'A flow with two Cue blocks — “Wikipedia Article” and “Has infobox” — each wrapping their own steps.',
      title: 'cues.orchestra',
      caption: 'Cues wrap steps that fire only when the page is ready.',
    },
  },
]

export default function FeatureSplits() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-5 sm:px-8">
      {SPLITS.map((split) => (
        <article
          key={split.eyebrow}
          className="grid items-center gap-12 border-t border-line py-16 first:border-t-0 lg:grid-cols-2 lg:gap-20 lg:py-24"
        >
          <div className={split.flip ? 'lg:order-2' : ''}>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-brass">{split.eyebrow}</p>
            <h3 className="mt-4 font-display text-3xl font-medium leading-[1.1] tracking-tight sm:text-4xl">
              {split.title}
            </h3>
            <p className="mt-5 max-w-lg leading-relaxed text-muted">{split.body}</p>
            <ul className="mt-7 flex flex-col gap-3">
              {split.points.map((point) => (
                <li key={point} className="flex items-start gap-3 text-[15px] text-muted">
                  <svg className="mt-1 shrink-0" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="#d9b36a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2.5 8.5l3.5 3.5L13.5 4" />
                  </svg>
                  {point}
                </li>
              ))}
            </ul>
          </div>

          <div className={split.flip ? 'lg:order-1' : ''}>
            <Shot
              src={split.shot.src}
              alt={split.shot.alt}
              width={split.shot.width}
              height={split.shot.height}
              title={split.shot.title}
              caption={split.shot.caption}
              sizes="(max-width: 1024px) 100vw, 520px"
              frameClassName="mx-auto w-fit"
              imgClassName="h-auto w-auto max-h-[480px]"
            />
          </div>
        </article>
      ))}
    </section>
  )
}
