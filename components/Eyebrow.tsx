import type { ReactNode } from 'react'

export default function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3.5">
      <span className="h-px w-9 bg-teal/60" />
      <span className="text-xs uppercase tracking-[0.26em] text-teal">{children}</span>
    </div>
  )
}
