import { type NextRequest } from 'next/server'
import { VERSION } from '@/lib/release'

const FILE_MAP: Record<string, Record<string, string>> = {
  mac: {
    arm64: `Orchestra-${VERSION}-arm64.dmg`,
  },
  win: {
    x64: `Orchestra Setup ${VERSION}.exe`,
  },
  linux: {
    x64: `Orchestra-${VERSION}.AppImage`,
  },
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const platform = searchParams.get('platform') ?? 'mac'
  const arch = searchParams.get('arch') ?? 'arm64'

  console.log(JSON.stringify({
    event: 'orchestra_download',
    version: VERSION,
    platform,
    arch,
    timestamp: new Date().toISOString(),
    userAgent: request.headers.get('user-agent') ?? 'unknown',
    referer: request.headers.get('referer') ?? 'direct',
    country: request.headers.get('x-vercel-ip-country') ?? 'unknown',
    city: request.headers.get('x-vercel-ip-city') ?? 'unknown',
  }))

  const filename = FILE_MAP[platform]?.[arch]

  if (!filename) {
    return new Response('File not found', { status: 404 })
  }

  const base = process.env.R2_DOWNLOAD_BASE_URL
  if (!base) {
    return new Response('Download unavailable', { status: 503 })
  }

  return Response.redirect(`${base}/${encodeURIComponent(filename)}`, 302)
}
