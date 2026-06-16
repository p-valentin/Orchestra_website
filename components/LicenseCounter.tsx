export default function LicenseCounter({ remaining, total }: { remaining: number; total: number }) {
  if (remaining <= 0) {
    return (
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-faint">
        License claims are now closed
      </p>
    )
  }

  return (
    <p className="font-mono text-xs uppercase tracking-[0.18em] text-brass">
      {remaining} of {total} licenses remaining
    </p>
  )
}
