import { NextRequest, NextResponse } from 'next/server'
import { isEmailAllowed, encodeSession, cookieOptions, COOKIE_NAME, SESSION_TTL_HOURS } from '@/lib/auth'
import { azureSignInConfig, emailFromIdToken, signInOrigin } from '@/lib/microsoftSignIn'

export const dynamic = 'force-dynamic'

const STATE_COOKIE = 'mm_ms_state'

function originOf(req: NextRequest): string {
  const host = req.headers.get('x-forwarded-host') || req.nextUrl.host
  const proto = (req.headers.get('x-forwarded-proto') || req.nextUrl.protocol.replace(':', '')).split(',')[0].trim()
  return signInOrigin(host, proto, process.env.APP_PUBLIC_URL)
}

function fail(origin: string, code: string) {
  const res = NextResponse.redirect(new URL(`/login?error=${code}`, origin))
  res.cookies.set(STATE_COOKIE, '', { httpOnly: true, path: '/', expires: new Date(0) })
  return res
}

/** Microsoft returns here with a code. A matching state cookie is required. */
export async function GET(req: NextRequest) {
  const origin = originOf(req)
  const cfg = azureSignInConfig()
  if (!cfg) return fail(origin, 'config')

  const state = req.nextUrl.searchParams.get('state') || ''
  const saved = req.cookies.get(STATE_COOKIE)?.value || ''
  if (!state || state !== saved) return fail(origin, 'state')

  const msError = req.nextUrl.searchParams.get('error') || ''
  if (msError) {
    const described = req.nextUrl.searchParams.get('error_description') || ''
    return fail(origin, msError === 'access_denied' ? 'denied' : /50011|redirect_uri/i.test(described) ? 'redirect' : 'failed')
  }

  const code = req.nextUrl.searchParams.get('code') || ''
  if (!code) return fail(origin, 'failed')

  const redirectUri = `${origin}/api/auth/microsoft/callback`
  let idToken = ''
  try {
    const tokenRes = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(cfg.tenant)}/oauth2/v2.0/token`, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        scope: 'openid profile email',
      }),
    })
    const data = (await tokenRes.json().catch(() => ({}))) as { id_token?: string; error?: string; error_description?: string }
    if (!tokenRes.ok || !data.id_token) {
      const described = data.error_description || ''
      return fail(origin, /50011|redirect_uri/i.test(described) ? 'redirect' : 'failed')
    }
    idToken = data.id_token
  } catch {
    return fail(origin, 'failed')
  }

  const email = emailFromIdToken(idToken, cfg.clientId, cfg.tenant)
  if (!email) return fail(origin, 'failed')
  if (!isEmailAllowed(email)) return fail(origin, 'domain')

  const token = await encodeSession(email)
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000)
  const res = NextResponse.redirect(new URL('/mail-merge', origin))
  res.cookies.set(COOKIE_NAME, token, cookieOptions(expiresAt))
  res.cookies.set(STATE_COOKIE, '', { httpOnly: true, path: '/', expires: new Date(0) })
  return res
}
