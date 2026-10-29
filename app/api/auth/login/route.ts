import { NextRequest, NextResponse } from 'next/server'
import { isEmailAllowed, checkPassword, encodeSession, cookieOptions, COOKIE_NAME, SESSION_TTL_HOURS } from '@/lib/auth'

export async function POST(req: NextRequest) {
  let email: string, password: string
  try {
    const body = await req.json() as { email?: string; password?: string }
    email = (body.email || '').trim().toLowerCase()
    password = (body.password || '').trim()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
  }

  if (!isEmailAllowed(email)) {
    // Generic message to avoid leaking allowed domain
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
  }

  let passwordOk: boolean
  try {
    passwordOk = checkPassword(password)
  } catch {
    return NextResponse.json({ error: 'Server auth is not configured.' }, { status: 500 })
  }

  if (!passwordOk) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
  }

  const token = await encodeSession(email)
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000)

  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, token, cookieOptions(expiresAt))
  return res
}
