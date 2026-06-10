import { type NextRequest, NextResponse } from 'next/server'
import { filesFor, r2Url, type Platform } from '@/lib/release'
import { liveVersion } from '@/lib/releases'
import { recordDownload } from '@/lib/stats'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform } = await params
  const version = await liveVersion()
  const file = filesFor(version)[platform as Platform]

  if (!file) {
    return NextResponse.json({ error: 'unknown platform' }, { status: 404 })
  }

  const upstream = await fetch(r2Url(platform as Platform, version))

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'file unavailable' }, { status: 502 })
  }

  const country = req.headers.get('x-vercel-ip-country') ?? 'unknown'
  await recordDownload(platform, country).catch(() => {})

  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': file.mime,
      'Content-Disposition': `attachment; filename="${file.name}"`,
      'Content-Length': upstream.headers.get('content-length') ?? '',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
