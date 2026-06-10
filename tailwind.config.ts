import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0b0a08',
        panel: '#13110c',
        well: '#0f0d0a',
        brass: '#d9b36a',
        'brass-bright': '#eed9a4',
        'brass-dim': '#8a744a',
        fg: '#f3eee2',
        muted: '#a59c88',
        faint: '#6f6754',
        ok: '#7fc97f',
      },
      fontFamily: {
        display: ['var(--font-fraunces)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      borderColor: {
        line: 'rgba(243,238,226,0.10)',
        'line-strong': 'rgba(243,238,226,0.18)',
      },
      keyframes: {
        marquee: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
        'marquee-rev': { from: { transform: 'translateX(-50%)' }, to: { transform: 'translateX(0)' } },
        spin: { to: { transform: 'rotate(360deg)' } },
      },
      animation: {
        marquee: 'marquee 48s linear infinite',
        'marquee-rev': 'marquee-rev 56s linear infinite',
      },
    },
  },
  plugins: [],
}

export default config
