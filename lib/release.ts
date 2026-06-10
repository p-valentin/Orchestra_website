export const VERSION = '0.9.2'

const R2 = 'https://downloads.orchestra-automation.com'

export const R2_FILES = {
  mac:   { name: `Orchestra-${VERSION}-arm64.dmg`,      mime: 'application/x-apple-diskimage' },
  win:   { name: `Orchestra Setup ${VERSION}.exe`,       mime: 'application/octet-stream' },
  linux: { name: `Orchestra-${VERSION}.AppImage`,        mime: 'application/octet-stream' },
} satisfies Record<string, { name: string; mime: string }>

export type Platform = keyof typeof R2_FILES

export function r2Url(platform: Platform): string {
  return `${R2}/${encodeURIComponent(R2_FILES[platform].name)}`
}
