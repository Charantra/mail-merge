import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session-cookie'

function isPublic(pathname: string): boolean {
  if (pathname === '/login') return true
  if (pathname.startsWith('/api/auth/')) return true
  if (pathname.startsWith('/_next/')) return true
  if (pathname.startsWith('/favicon')) return true
  if (pathname.startsWith('/brand/')) return true
  // Open pixel and click links inside sent mail. Tokens are HMAC-signed.
  if (pathname.startsWith('/mm/o/') || pathname.startsWith('/mm/c/')) return true
  return false
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (isPublic(pathname)) return NextResponse.next()

  const email = await getSessionFromRequest(req)
  if (!email) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.search = ''
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
