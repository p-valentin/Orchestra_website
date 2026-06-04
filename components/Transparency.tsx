import ProductShot from './ProductShot'
import Eyebrow from './Eyebrow'

export default function Transparency() {
  return (
    <section className="border-t border-subtle bg-surface/30">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 lg:py-32">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16">
          <div>
            <Eyebrow>Nothing hidden</Eyebrow>
            <h2 className="mt-5 font-display text-5xl font-semibold leading-[1.0] tracking-tight text-text-primary sm:text-6xl">
              See every value,
              <span className="block italic font-medium text-teal">every step.</span>
            </h2>
            <p className="mt-6 max-w-md leading-relaxed text-text-secondary">
              Orchestra tracks each variable as the run unfolds — where it came from, which step set
              it, what it became. When something breaks, you don&apos;t guess. You look.
            </p>
            <ul className="mt-8 flex flex-col gap-3 text-sm text-text-secondary">
              <li className="flex items-center gap-3">
                <span className="h-1.5 w-1.5 rounded-full bg-teal" /> Live variable timeline &amp; provenance
              </li>
              <li className="flex items-center gap-3">
                <span className="h-1.5 w-1.5 rounded-full bg-teal" /> Per-step input / output inspector
              </li>
              <li className="flex items-center gap-3">
                <span className="h-1.5 w-1.5 rounded-full bg-teal" /> Auto-snapshot on failure
              </li>
            </ul>
          </div>

          <ProductShot
            src="/shots/variables.png"
            alt="Orchestra's Variables panel: initial inputs, temporary variables tagged with the step that set them, and a timestamped change history."
            width={709}
            height={839}
            caption="Initial inputs, temporary values, and a full change history — each tagged with the step that set it."
            sizes="(max-width: 1024px) 100vw, 460px"
            frameClassName="mx-auto w-fit"
            imgClassName="h-auto w-auto max-h-[460px]"
          />
        </div>
      </div>
    </section>
  )
}
