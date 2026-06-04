export default function LogoMark({
  size = 32,
  className = '',
}: {
  size?: number
  priority?: boolean // accepted for call-site compatibility; unused for inline SVG
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      role="img"
      aria-label="Orchestra"
    >
      <path
        d="M15 15 H29 a6 6 0 0 1 0 12 H21 a6 6 0 0 0 0 12 H30"
        stroke="#7a6e52"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <line x1="18.2" y1="14" x2="18.2" y2="6" stroke="#d2ab5e" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M18.2 6 q5 1 3.4 5.8" stroke="#d2ab5e" strokeWidth="2.4" strokeLinecap="round" />
      <ellipse cx="15" cy="15" rx="4.4" ry="3.5" fill="#d2ab5e" transform="rotate(-22 15 15)" />
      <path d="M30 32 L40 38 L30 44 Z" fill="#d2ab5e" />
    </svg>
  )
}
