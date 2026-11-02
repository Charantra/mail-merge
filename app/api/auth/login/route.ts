import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/** The shared password is retired. Sign-in starts at Microsoft. */
export function GET(req: NextRequest) {
  const url = req.nextUrl.clone()
  url.pathname = '/api/auth/microsoft'
  url.search = ''
  return NextResponse.redirect(url)
}

export function POST() {
  return NextResponse.json({ error: 'Sign in with Microsoft.' }, { status: 410 })
}
