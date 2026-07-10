import type { DocNavLink } from '@/lib/docs'

export default function DocsPrevNext({ prev, next }: { prev: DocNavLink | null; next: DocNavLink | null }) {
  if (!prev && !next) return null

  return (
    <div className="mt-16 grid gap-4 sm:grid-cols-2">
      {prev ? (
        <a href={prev.href} className="group rounded-xl border border-line bg-panel p-5 transition-colors hover:border-brass/50">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-faint">← Previous</p>
          <p className="mt-1.5 font-display text-lg font-medium tracking-tight transition-colors group-hover:text-brass-bright">
            {prev.label}
          </p>
        </a>
      ) : (
        <div className="hidden sm:block" />
      )}
      {next && (
        <a
          href={next.href}
          className="group rounded-xl border border-line bg-panel p-5 text-right transition-colors hover:border-brass/50"
        >
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-faint">Next →</p>
          <p className="mt-1.5 font-display text-lg font-medium tracking-tight transition-colors group-hover:text-brass-bright">
            {next.label}
          </p>
        </a>
      )}
    </div>
  )
}
