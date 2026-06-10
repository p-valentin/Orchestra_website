import { type NextRequest } from 'next/server'
import { filesFor, type Platform } from '@/lib/release'
import { liveVersion } from '@/lib/releases'
import { recordDownload } from '@/lib/stats'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const platform = searchParams.get('platform') ?? 'mac'
  const arch = searchParams.get('arch') ?? 'arm64'

  const version = await liveVersion()
  const country = request.headers.get('x-vercel-ip-country') ?? 'unknown'

  console.log(JSON.stringify({
    event: 'orchestra_download',
    version,
    platform,
    arch,
    timestamp: new Date().toISOString(),
    userAgent: request.headers.get('user-agent') ?? 'unknown',
    referer: request.headers.get('referer') ?? 'direct',
    country,
    city: request.headers.get('x-vercel-ip-city') ?? 'unknown',
  }))

  const file = filesFor(version)[platform as Platform]
  if (!file) {
    return new Response('File not found', { status: 404 })
  }

  const base = process.env.R2_DOWNLOAD_BASE_URL
  if (!base) {
    return new Response('Download unavailable', { status: 503 })
  }

  await recordDownload(platform, country).catch(() => {})

  return Response.redirect(`${base}/${encodeURIComponent(file.name)}`, 302)
}
