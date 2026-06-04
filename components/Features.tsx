import ProductShot from './ProductShot'
import Eyebrow from './Eyebrow'

type Feature = {
  movement: string
  title: string
  desc: string
  img: { src: string; width: number; height: number; alt: string; portrait: boolean }
  caption: string
  flip: boolean
}

const FEATURES: Feature[] = [
  {
    movement: 'I',
    title: 'Visual instruments',
    desc: '40+ action types — navigate, extract, assert, loop, branch, transform. You build automation like a score: one readable step after another. No boilerplate, no selectors to memorize.',
    img: {
      src: '/shots/instruments.png',
      width: 383,
      height: 864,
      portrait: true,
      alt: 'An Orchestra flow with Stealth, Set Headers, Navigate, Assert URL, groups, cues, conditions and loops — each step showing its live run time.',
    },
    caption: 'A real flow — every step timed and traced as it runs.',
    flip: false,
  },
  {
    movement: 'II',
    title: 'Your code, always',
    desc: 'Every visual step compiles to real, runnable Playwright. Read it, edit it, export it, run it anywhere Node runs — no runtime, no account, no lock-in. This page verifies the generated script with node --check.',
    img: {
      src: '/shots/code.png',
      width: 1520,
      height: 1510,
      portrait: false,
      alt: 'The generated Playwright code: a require, an inputs object with the real Wikipedia URL and sections, and an async run() that navigates, asserts, extracts and screenshots.',
    },
    caption: 'Generated Playwright, synced live with the visual script.',
    flip: true,
  },
  {
    movement: 'III',
    title: 'Cue',
    desc: 'A Cue watches the page and fires the instant its condition is met — cookie banners, infoboxes, late-loading content, session prompts. It handles the unexpected without breaking the flow you built.',
    img: {
      src: '/shots/cue.png',
      width: 516,
      height: 829,
      portrait: true,
      alt: 'The same flow with two Cue blocks — "Wikipedia Article" and "Has infobox" — each wrapping their own steps.',
    },
    caption: 'Cues wrap steps that fire only when the page is ready.',
    flip: false,
  },
]

export default function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-5 py-24 sm:px-8 lg:py-32">
      <Eyebrow>The programme</Eyebrow>
      <h2 className="mt-5 max-w-xl font-display text-5xl font-semibold leading-[1.02] tracking-tight text-text-primary sm:text-6xl">
        Three movements,
        <span className="italic font-medium text-teal"> one performance.</span>
      </h2>

      <div className="mt-16 flex flex-col lg:mt-20">
        {FEATURES.map((feature) => (
          <article
            key={feature.movement}
            className="grid items-center gap-10 border-t border-subtle py-16 first:border-t-0 first:pt-4 lg:grid-cols-2 lg:gap-16 lg:py-20"
          >
            <div className={feature.flip ? 'lg:order-2' : ''}>
              <div className="flex items-baseline gap-4">
                <span className="font-display text-4xl font-medium italic text-teal">{feature.movement}.</span>
                <h3 className="font-display text-3xl font-semibold tracking-tight text-text-primary">
                  {feature.title}
                </h3>
              </div>
              <p className="mt-5 max-w-md text-lg leading-relaxed text-text-secondary">{feature.desc}</p>
            </div>

            <div className={feature.flip ? 'lg:order-1' : ''}>
              <ProductShot
                src={feature.img.src}
                alt={feature.img.alt}
                width={feature.img.width}
                height={feature.img.height}
                caption={feature.caption}
                sizes="(max-width: 1024px) 100vw, 520px"
                frameClassName="mx-auto w-fit"
                imgClassName="h-auto w-auto max-h-[460px]"
              />
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
