import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/adminAuth'

export async function middleware(request: NextRequest) {
  // Without a configured password the admin area simply doesn't exist.
  if (!process.env.ADMIN_PASSWORD) {
    return new NextResponse('Not found', { status: 404 })
  }

  const { pathname } = request.nextUrl
  const noindex = (response: NextResponse) => {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow')
    return response
  }

  if (pathname === '/admin/login') {
    return noindex(NextResponse.next())
  }

  const valid = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)
  if (!valid) {
    return noindex(NextResponse.redirect(new URL('/admin/login', request.url)))
  }

  return noindex(NextResponse.next())
}

export const config = {
  matcher: ['/admin/:path*', '/admin'],
}
