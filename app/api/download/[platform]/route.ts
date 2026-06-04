import { type NextRequest, NextResponse } from 'next/server'
import { R2_FILES, r2Url, type Platform } from '@/lib/release'

export const runtime = 'edge'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform } = await params
  const file = R2_FILES[platform as Platform]

  if (!file) {
    return NextResponse.json({ error: 'unknown platform' }, { status: 404 })
  }

  const upstream = await fetch(r2Url(platform as Platform))

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'file unavailable' }, { status: 502 })
  }

  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': file.mime,
      'Content-Disposition': `attachment; filename="${file.name}"`,
      'Content-Length': upstream.headers.get('content-length') ?? '',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
