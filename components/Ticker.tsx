const ITEMS = [
  'You conduct',
  'It plays',
  'Real code output',
  'No lock-in',
  '40+ instruments',
  'Visual + code',
  'Export anywhere',
]

function Row() {
  return (
    <>
      {ITEMS.map((item, i) => (
        <span key={i} className="flex items-center gap-6">
          <span className="font-mono text-sm uppercase tracking-widest text-text-secondary">{item}</span>
          <span className="text-teal" aria-hidden="true">
            ◆
          </span>
        </span>
      ))}
    </>
  )
}

export default function Ticker() {
  return (
    <div
      className="overflow-hidden border-y border-subtle bg-[#08111f] py-4"
      aria-hidden="true"
    >
      <div className="flex w-max animate-ticker gap-6">
        <div className="flex gap-6">
          <Row />
        </div>
        <div className="flex gap-6">
          <Row />
        </div>
      </div>
    </div>
  )
}
