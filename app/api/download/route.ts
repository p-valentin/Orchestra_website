import { type NextRequest } from 'next/server'
import { filesFor, type Platform } from '@/lib/release'
import { liveVersion } from '@/lib/releases'
import { isBotUserAgent, recordDownload } from '@/lib/stats'

// The one counted download path.
//
// Auto-updates do NOT come through here: electron-updater fetches latest*.yml
// directly from downloads.orchestra-automation.com, so it never reaches Vercel.
// Every hit below is somebody deliberately installing, which is exactly what
// makes the number worth showing on the admin page.

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const platform = searchParams.get('platform') ?? 'mac'
  const arch = searchParams.get('arch') ?? 'arm64'

  const version = await liveVersion()
  const country = request.headers.get('x-vercel-ip-country') ?? 'unknown'
  const userAgent = request.headers.get('user-agent')
  const bot = isBotUserAgent(userAgent)

  console.log(JSON.stringify({
    event: 'orchestra_download',
    version,
    platform,
    arch,
    bot,
    timestamp: new Date().toISOString(),
    userAgent: userAgent ?? 'unknown',
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

  // Bots still get the file — this is a public download and there is no reason
  // to serve a crawler a 403. They just don't get counted as installs.
  if (!bot) {
    await recordDownload(platform, country, version).catch(() => {})
  }

  return Response.redirect(`${base}/${encodeURIComponent(file.name)}`, 302)
}
