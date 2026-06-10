export const VERSION = '0.9.2'

const R2 = 'https://downloads.orchestra-automation.com'

export function filesFor(version: string) {
  return {
    mac:   { name: `Orchestra-${version}-arm64.dmg`,  mime: 'application/x-apple-diskimage' },
    win:   { name: `Orchestra Setup ${version}.exe`,  mime: 'application/octet-stream' },
    linux: { name: `Orchestra-${version}.AppImage`,   mime: 'application/octet-stream' },
  } satisfies Record<string, { name: string; mime: string }>
}

export const R2_FILES = filesFor(VERSION)

export type Platform = keyof typeof R2_FILES

export function r2Url(platform: Platform, version = VERSION): string {
  return `${R2}/${encodeURIComponent(filesFor(version)[platform].name)}`
}
