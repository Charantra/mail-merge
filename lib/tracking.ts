/**
 * Open and click tracking for emails sent through Microsoft Graph, which has none
 * of its own. ZeptoMail tracks its own sends, so this is never added to them.
 *
 * Each link points at /t/c/<token> and the pixel at /t/o/<token>. The token is the
 * outreach id (and, for a click, the destination URL) signed with HMAC, so nobody
 * can forge an event or use the redirect to send people elsewhere.
 *
 * Only works from a public https address (APP_PUBLIC_URL): a localhost link in an
 * investor's inbox would point nowhere. Opens are approximate on any provider.
 */
import { createHmac, timingSafeEqual } from 'crypto'

function secret(): string {
  const s = (process.env.TRACKING_SECRET || process.env.AUTH_SECRET || '').trim()
  if (s.length < 32) throw new Error('TRACKING_SECRET or AUTH_SECRET (32+ chars) is required for tracking links.')
  return s
}

function b64url(s: string | Buffer): string {
  return Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function unb64url(s: string): string {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
}

function sign(payload: string): string {
  return b64url(createHmac('sha256', secret()).update(payload).digest()).slice(0, 32)
}

export type TrackPayload = { o: string; u?: string }

export function makeToken(payload: TrackPayload): string {
  const body = b64url(JSON.stringify(payload))
  return `${body}.${sign(body)}`
}

export function readToken(token: string): TrackPayload | null {
  const dot = token.lastIndexOf('.')
  if (dot < 1) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  let expected: string
  try {
    expected = sign(body)
  } catch {
    return null
  }
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const p = JSON.parse(unb64url(body)) as TrackPayload
    if (typeof p.o !== 'string' || !p.o) return null
    if (p.u !== undefined && !/^https?:\/\//i.test(p.u)) return null
    return p
  } catch {
    return null
  }
}

/** The public base for tracking links, or null when tracking cannot work here. */
export function trackingBase(): string | null {
  if ((process.env.GRAPH_TRACKING || '').trim() === '0') return null
  const raw = (process.env.APP_PUBLIC_URL || '').trim().replace(/\/+$/, '')
  if (!raw) return null
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:') return null
    if (/^(localhost|127\.|\[::1\])/.test(u.hostname) || u.hostname.endsWith('.localhost')) return null
    return `${u.protocol}//${u.host}`
  } catch {
    return null
  }
}

/**
 * Rewrite every http(s) link through the click route and append the open pixel.
 * mailto: links are left alone. Returns the HTML unchanged when there is no public base.
 */
export function instrumentHtml(html: string, outreachId: string): { html: string; enabled: boolean } {
  const base = trackingBase()
  if (!base) return { html, enabled: false }
  const linked = html.replace(/(<a\b[^>]*?\bhref=")(https?:\/\/[^"]+)(")/gi, (_m, pre, url, post) => {
    const real = String(url).replace(/&amp;/g, '&')
    return `${pre}${base}/t/c/${makeToken({ o: outreachId, u: real })}${post}`
  })
  const pixel = `<img src="${base}/t/o/${makeToken({ o: outreachId })}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0" />`
  return { html: `${linked}${pixel}`, enabled: true }
}

/**
 * Mail scanners and privacy proxies fetch images before (or instead of) a person.
 * Flag what is very likely a machine so opens stay honest. Gmail's image proxy is
 * fetched when a person opens, so it is not flagged.
 */
export function looksLikeMachine(userAgent: string, secondsSinceSend: number | null): boolean {
  const ua = userAgent.toLowerCase()
  if (secondsSinceSend !== null && secondsSinceSend < 20) return true
  return /bot|crawler|spider|preview|scanner|barracuda|mimecast|proofpoint|safelinks|outlook-ios-protection|curl|wget|python|go-http/i.test(ua)
}
