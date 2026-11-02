/**
 * Microsoft sign-in (authorization code). Sending mail still uses the app's own
 * Graph token. This only identifies the person.
 */

export function azureSignInConfig(): { tenant: string; clientId: string; clientSecret: string } | null {
  const tenant = process.env.AZURE_TENANT_ID?.trim() || ''
  const clientId = process.env.AZURE_CLIENT_ID?.trim() || ''
  const clientSecret = process.env.AZURE_CLIENT_SECRET?.trim() || ''
  if (!tenant || !clientId || !clientSecret) return null
  return { tenant, clientId, clientSecret }
}

/** Where Microsoft should send the browser back. Localhost stays local. */
export function signInOrigin(host: string, proto: string, configured: string | undefined): string {
  const name = host.split(':')[0]?.toLowerCase() || ''
  if (name === 'localhost' || name === '127.0.0.1') return `${proto}://${host}`
  const base = configured?.trim().replace(/\/$/, '')
  if (base) return base
  return `${proto}://${host}`
}

export function authorizeUrl(input: { tenant: string; clientId: string; redirectUri: string; state: string }): string {
  const q = new URLSearchParams({
    client_id: input.clientId,
    response_type: 'code',
    redirect_uri: input.redirectUri,
    response_mode: 'query',
    scope: 'openid profile email',
    state: input.state,
    prompt: 'select_account',
  })
  return `https://login.microsoftonline.com/${encodeURIComponent(input.tenant)}/oauth2/v2.0/authorize?${q}`
}

function payloadOf(idToken: string): Record<string, unknown> | null {
  const parts = idToken.split('.')
  if (parts.length < 2) return null
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
    return JSON.parse(Buffer.from(b64 + pad, 'base64').toString('utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

/** Email from an id token Microsoft returned to this app. Null when the claims do not match. */
export function emailFromIdToken(idToken: string, clientId: string, tenantId: string, now = Date.now()): string | null {
  const payload = payloadOf(idToken)
  if (!payload) return null
  if (payload.aud !== clientId) return null
  const iss = typeof payload.iss === 'string' ? payload.iss : ''
  if (!tenantId || !iss.includes(tenantId)) return null
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= now) return null
  const raw = payload.email || payload.preferred_username || payload.upn
  if (typeof raw !== 'string' || !raw.includes('@')) return null
  return raw.trim().toLowerCase()
}
