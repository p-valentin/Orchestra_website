import { type NextRequest } from 'next/server'
import { filesFor, type Platform } from '@/lib/release'
import { liveVersion } from '@/lib/releases'
import { isBotUserAgent, recordDownload, refererHost } from '@/lib/stats'

// Source labels are echoed back into a stored key, so they are constrained to
// the shape a hostname or utm_source actually has rather than trusted.
const SOURCE_RE = /^[a-z0-9.\-_]{1,100}$/

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

  // First-touch source from the client (see lib/attribution), falling back to
  // this request's own referer. The fallback is nearly always same-site and so
  // resolves to '' — it only earns its place for a link someone posts straight
  // to /api/download, which does happen once a release is mirrored anywhere.
  const claimed = searchParams.get('ref')?.toLowerCase() ?? ''
  const source = SOURCE_RE.test(claimed)
    ? claimed
    : refererHost(request.headers.get('referer'), request.headers.get('host'))

  console.log(JSON.stringify({
    event: 'orchestra_download',
    version,
    platform,
    arch,
    bot,
    timestamp: new Date().toISOString(),
    userAgent: userAgent ?? 'unknown',
    referer: request.headers.get('referer') ?? 'direct',
    source: source || 'direct',
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
    await recordDownload(platform, country, version, source).catch(() => {})
  }

  return Response.redirect(`${base}/${encodeURIComponent(file.name)}`, 302)
}
