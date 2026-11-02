import { randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { authorizeUrl, azureSignInConfig, signInOrigin } from '@/lib/microsoftSignIn'

export const dynamic = 'force-dynamic'

const STATE_COOKIE = 'mm_ms_state'

function originOf(req: NextRequest): string {
  const host = req.headers.get('x-forwarded-host') || req.nextUrl.host
  const proto = (req.headers.get('x-forwarded-proto') || req.nextUrl.protocol.replace(':', '')).split(',')[0].trim()
  return signInOrigin(host, proto, process.env.APP_PUBLIC_URL)
}

/** Send the browser to Microsoft. The password form is gone. */
export async function GET(req: NextRequest) {
  const cfg = azureSignInConfig()
  const origin = originOf(req)
  if (!cfg) {
    return NextResponse.redirect(new URL('/login?error=config', origin))
  }
  const state = randomBytes(24).toString('base64url')
  const redirectUri = `${origin}/api/auth/microsoft/callback`
  const res = NextResponse.redirect(authorizeUrl({ tenant: cfg.tenant, clientId: cfg.clientId, redirectUri, state }))
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })
  return res
}
