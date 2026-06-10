import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/adminAuth'

export function middleware(request: NextRequest) {
  // Without a configured password the admin area simply doesn't exist.
  if (!process.env.ADMIN_PASSWORD) {
    return new NextResponse('Not found', { status: 404 })
  }

  if (!isAdminRequest(request.headers.get('authorization'))) {
    return new NextResponse('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="orchestra", charset="UTF-8"',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    })
  }

  const response = NextResponse.next()
  response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return response
}

export const config = {
  matcher: ['/admin/:path*', '/admin'],
}
