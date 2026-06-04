export const VERSION = '0.9.2'

const BASE = 'https://downloads.orchestra-automation.com'

export const DOWNLOADS = {
  mac: {
    arm64: `${BASE}/Orchestra-${VERSION}-arm64.dmg`,
    x64: `${BASE}/Orchestra-${VERSION}-x64.dmg`,
  },
  windows: {
    x64: `${BASE}/Orchestra%20Setup%20${VERSION}.exe`,
  },
  linux: {
    x64: `${BASE}/Orchestra-${VERSION}.AppImage`,
  },
}

export const GITHUB_RELEASES = `https://github.com/p-valentin/Orchestra/releases/tag/v${VERSION}`
