/**
 * Edge-safe session cookie encode/decode (Web Crypto).
 * Safe to import from middleware.ts — no Node.js `crypto` / Buffer.
 */

export const COOKIE_NAME = 'outreach_session'
export const SESSION_TTL_HOURS = 12

export interface SessionPayload {
  email: string
  exp: number
}

function secret(): string {
  const s = process.env.AUTH_SECRET?.trim()
  if (!s || s.length < 32) {
    throw new Error(
      'AUTH_SECRET is missing or too short (must be 32+ chars). Set it in .env.local.',
    )
  }
  return s
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  // btoa is available in Edge + Node 18+
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
  const binary = atob(b64 + pad)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

async function hmacHex(data: string, keyMaterial: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(keyMaterial),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return hex(sig)
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

export async function encodeSession(email: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_HOURS * 3600
  const payload = JSON.stringify({ email, exp } satisfies SessionPayload)
  const b64 = toBase64Url(new TextEncoder().encode(payload))
  const sig = await hmacHex(b64, secret())
  return `${b64}.${sig}`
}

export async function decodeSession(token: string): Promise<SessionPayload | null> {
  const dot = token.lastIndexOf('.')
  if (dot < 0) return null
  const b64 = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  let expected: string
  try {
    expected = await hmacHex(b64, secret())
  } catch {
    return null
  }
  if (!timingSafeEqualHex(expected, sig)) return null
  try {
    const json = new TextDecoder().decode(fromBase64Url(b64))
    const payload = JSON.parse(json) as SessionPayload
    if (!payload.email || typeof payload.exp !== 'number') return null
    if (Date.now() / 1000 > payload.exp) return null
    return payload
  } catch {
    return null
  }
}

export function cookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    expires: expiresAt,
  }
}

export async function getSessionFromRequest(req: {
  cookies: { get(name: string): { value: string } | undefined }
}): Promise<string | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return null
  const payload = await decodeSession(token)
  return payload?.email ?? null
}
