function daysLeft(cutoff: number | null | undefined): number | null {
  if (cutoff === null || cutoff === undefined) return null
  const ms = cutoff - Date.now()
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000)
}

export default function LicenseCounter({
  remaining,
  total,
  cutoff,
  closed,
}: {
  remaining: number
  total: number
  cutoff?: number | null
  closed?: boolean
}) {
  if (closed ?? remaining <= 0) {
    return (
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-faint">
        Free license claims are now closed
      </p>
    )
  }

  const days = daysLeft(cutoff)
  return (
    <p className="font-mono text-xs uppercase tracking-[0.18em] text-brass">
      {remaining} of {total} licenses left
      {days !== null && ` · ${days} day${days === 1 ? '' : 's'} left`}
    </p>
  )
}
