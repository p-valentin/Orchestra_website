import { ImageResponse } from 'next/og'

// Site-wide OG/Twitter card. next/og renders this at the edge; no font files
// needed — system serif/sans approximate the site's Fraunces/Inter pairing.

export const runtime = 'edge'
export const alt = 'Orchestra — Automate any website. Keep the code.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          backgroundColor: '#0b0a08',
          backgroundImage: 'radial-gradient(ellipse at 20% 0%, #1c150a 0%, #0b0a08 60%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              backgroundColor: '#c9973f',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#1a1306',
              fontSize: 34,
              fontWeight: 700,
              fontFamily: 'serif',
            }}
          >
            O
          </div>
          <div style={{ color: '#f2ead9', fontSize: 44, fontWeight: 600, fontFamily: 'serif' }}>Orchestra</div>
        </div>
        <div
          style={{
            marginTop: 48,
            color: '#f2ead9',
            fontSize: 76,
            fontWeight: 600,
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
            fontFamily: 'serif',
            maxWidth: 950,
          }}
        >
          Automate any website. Keep the code.
        </div>
        <div style={{ marginTop: 36, color: '#b3a98f', fontSize: 30, maxWidth: 900, lineHeight: 1.35 }}>
          Browser automation and web scraping, built visually — exported as plain Playwright you own forever.
        </div>
        <div style={{ marginTop: 48, color: '#c9973f', fontSize: 24, fontFamily: 'monospace' }}>
          orchestra-automation.com
        </div>
      </div>
    ),
    size,
  )
}
