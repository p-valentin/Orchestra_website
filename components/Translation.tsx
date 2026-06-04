import Image from 'next/image'
import Eyebrow from './Eyebrow'

function TranslationArrow() {
  return (
    <div
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center text-teal"
    >
      <svg
        viewBox="0 0 48 24"
        width="44"
        height="22"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="rotate-90 lg:rotate-0"
      >
        <path d="M2 12h42m0 0l-9-9m9 9l-9 9" />
      </svg>
    </div>
  )
}

export default function Translation() {
  return (
    <section id="code" className="border-t border-subtle">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 lg:py-32">
        <div className="max-w-2xl">
          <Eyebrow>Canvas → code</Eyebrow>
          <h2 className="mt-5 font-display text-5xl font-semibold leading-[1.0] tracking-tight text-text-primary sm:text-6xl">
            Drawn here. <span className="italic font-medium text-teal">Runs there.</span>
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-text-secondary">
            The flow you build on the left compiles, step for step, into the Playwright script on the
            right — inputs, cues, loops and all. It&apos;s plain Node.js: export it and run it in CI,
            a cron job, or a teammate&apos;s machine. No runtime, no account, no lock-in.
          </p>
        </div>

        <div className="mt-14 flex flex-col items-center gap-6 lg:mt-16 lg:flex-row lg:justify-center lg:gap-8">
          <div className="w-full max-w-[300px] lg:w-auto">
            <div className="overflow-hidden rounded-xl border border-subtle bg-surface shadow-xl shadow-black/40 ring-1 ring-white/5">
              <Image
                src="/shots/cue.png"
                alt="The visual flow tree in Orchestra, with cues, groups, and steps."
                width={516}
                height={829}
                sizes="(max-width: 1024px) 90vw, 290px"
                className="mx-auto h-auto w-auto max-h-[440px]"
              />
            </div>
            <p className="mt-3 text-center font-mono text-xs text-text-secondary">Visual script</p>
          </div>

          <TranslationArrow />

          <div className="w-full lg:max-w-[640px]">
            <div className="overflow-hidden rounded-xl border border-subtle bg-surface shadow-xl shadow-black/40 ring-1 ring-white/5">
              <Image
                src="/shots/code.png"
                alt="The Playwright code generated from the visual script — verified valid with node --check."
                width={1520}
                height={1510}
                sizes="(max-width: 1024px) 100vw, 640px"
                className="h-auto w-full"
              />
            </div>
            <p className="mt-3 text-center font-mono text-xs text-text-secondary">
              Generated Playwright
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
