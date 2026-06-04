import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0b0a08',
        surface: '#16110a',
        navy: '#4a3c22',
        teal: '#d2ab5e', // brass — the accent
        brass: '#d2ab5e',
        'brass-bright': '#e7c884',
        'text-primary': '#f2ece1',
        'text-secondary': '#9a907c',
      },
      fontFamily: {
        display: ['var(--font-fraunces)', 'Georgia', 'serif'],
        sans: ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'monospace'],
      },
      borderColor: {
        subtle: 'rgba(242,236,225,0.09)',
      },
      keyframes: {
        ticker: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
        glow: {
          '0%,100%': { opacity: '0.55' },
          '50%': { opacity: '0.9' },
        },
        blink: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.25' } },
      },
      animation: {
        ticker: 'ticker 32s linear infinite',
        glow: 'glow 5s ease-in-out infinite',
        blink: 'blink 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

export default config
