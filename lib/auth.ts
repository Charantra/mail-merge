import { timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import {
  COOKIE_NAME,
  SESSION_TTL_HOURS,
  encodeSession,
  decodeSession,
  cookieOptions,
  getSessionFromRequest,
} from './session-cookie'

function allowedDomain(): string {
  return (process.env.AUTH_ALLOWED_DOMAIN || 'charantra.ai').trim().toLowerCase()
}

export function isEmailAllowed(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${allowedDomain()}`)
}

export function checkPassword(input: string): boolean {
  const expected = process.env.AUTH_PASSWORD?.trim()
  if (!expected) {
    throw new Error('AUTH_PASSWORD not set. Configure it in .env.local.')
  }
  const a = Buffer.from(input)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** Read + validate the session from the request cookie store. Returns email or null. */
export async function getSession(): Promise<string | null> {
  try {
    const jar = await cookies()
    const token = jar.get(COOKIE_NAME)?.value
    if (!token) return null
    const payload = await decodeSession(token)
    return payload?.email ?? null
  } catch {
    return null
  }
}

export {
  COOKIE_NAME,
  SESSION_TTL_HOURS,
  encodeSession,
  decodeSession,
  cookieOptions,
  getSessionFromRequest,
}
