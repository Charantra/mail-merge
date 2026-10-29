let msToken: string | null = null
let msTokenExpiry: number = 0
let tokenInflight: Promise<string> | null = null
let tokenFetchGen = 0

/** Refresh early — local clocks are often minutes ahead/behind Azure (observed ~5m). */
const TOKEN_SKEW_MS = 360_000

export function resetMSTokenCache() {
  msToken = null
  msTokenExpiry = 0
  // Do not cancel in-flight fetches mid-way; generation guards which result is stored.
  tokenFetchGen += 1
  tokenInflight = null
}

function isJwtUsable(token: string): boolean {
  const now = Date.now()
  const payload = decodeJwtPayload(token)
  if (!payload) return false

  const expMs =
    typeof payload.exp === 'number' ? payload.exp * 1000 : null
  const nbfMs =
    typeof payload.nbf === 'number'
      ? payload.nbf * 1000
      : typeof payload.iat === 'number'
        ? payload.iat * 1000
        : null

  // Hard fail if JWT is past/near expiry on local clock (do not trust a long msTokenExpiry alone).
  if (expMs != null && now >= expMs - TOKEN_SKEW_MS) return false
  if (nbfMs != null && now + TOKEN_SKEW_MS < nbfMs) return false

  if (msTokenExpiry && now >= msTokenExpiry - TOKEN_SKEW_MS) return false
  return true
}

function decodeJwtPayload(token: string): any | null {
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
    const json = Buffer.from(b64 + pad, 'base64').toString('utf8')
    return JSON.parse(json)
  } catch {
    return null
  }
}

function jwtExpMs(token: string): number | null {
  const payload = decodeJwtPayload(token)
  const exp = payload && typeof payload.exp === 'number' ? payload.exp : null
  return typeof exp === 'number' ? exp * 1000 : null
}

export async function debugMSTokenClaims(): Promise<{
  now_iso: string
  now_ms: number
  exp?: number
  exp_iso?: string
  iat?: number
  iat_iso?: string
  tid?: string
  aud?: string
  appid?: string
}> {
  const tok = await getMSToken({ force: true })
  const payload = decodeJwtPayload(tok) || {}
  const nowMs = Date.now()
  const exp = typeof payload.exp === 'number' ? payload.exp : undefined
  const iat = typeof payload.iat === 'number' ? payload.iat : undefined
  return {
    now_iso: new Date(nowMs).toISOString(),
    now_ms: nowMs,
    exp,
    exp_iso: exp ? new Date(exp * 1000).toISOString() : undefined,
    iat,
    iat_iso: iat ? new Date(iat * 1000).toISOString() : undefined,
    tid: typeof payload.tid === 'string' ? payload.tid : undefined,
    aud: typeof payload.aud === 'string' ? payload.aud : undefined,
    appid: typeof payload.appid === 'string' ? payload.appid : undefined,
  }
}

export async function getMSToken(opts?: { force?: boolean }): Promise<string> {
  if (opts?.force) {
    msToken = null
    msTokenExpiry = 0
    tokenFetchGen += 1
    tokenInflight = null
  }

  if (msToken && isJwtUsable(msToken)) return msToken
  if (msToken) {
    msToken = null
    msTokenExpiry = 0
  }

  // Only join an in-flight fetch when not forcing a brand-new token.
  if (tokenInflight && !opts?.force) return tokenInflight

  const myGen = ++tokenFetchGen
  const p = (async () => {
    const res = await fetch(
      `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.AZURE_CLIENT_ID!,
          client_secret: process.env.AZURE_CLIENT_SECRET!,
          scope: 'https://graph.microsoft.com/.default',
          grant_type: 'client_credentials',
        }),
      },
    )

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`MS token error ${res.status}: ${err}`)
    }

    const data = (await res.json()) as {
      access_token?: string
      expires_in?: number
    }

    if (!data.access_token) throw new Error('No access_token in MS response')

    // Superseded by a newer force-refresh — discard this result for the cache.
    if (myGen !== tokenFetchGen) return data.access_token

    msToken = data.access_token

    // Cache until the earlier deadline so a fast local clock cannot keep a Graph-rejected token.
    const ttlMs = Math.max(60, (data.expires_in ?? 3600) - 300) * 1000
    const fromExpiresIn = Date.now() + ttlMs
    const fromJwt = jwtExpMs(msToken)
    msTokenExpiry =
      fromJwt != null ? Math.min(fromExpiresIn, fromJwt - TOKEN_SKEW_MS) : fromExpiresIn

    return msToken
  })()

  tokenInflight = p
  try {
    return await p
  } finally {
    if (tokenInflight === p) tokenInflight = null
  }
}

/** Graph 401s that a brand-new client-credentials token usually clears. */
export function isGraphAuthFailure(status: number, raw: string): boolean {
  if (status !== 401) return false
  return /token is expired|lifetime validation failed|invalid token lifetime|invalid_token|invalidauthenticationtoken|unauthorized/i.test(
    raw,
  )
}

export function graphErrorMessage(raw: string, fallback: string): string {
  try {
    const err = JSON.parse(raw) as { error?: { message?: string } }
    const msg = (err.error?.message || '').trim()
    if (msg) return msg.slice(0, 280)
  } catch {
    /* non-JSON */
  }
  return fallback
}

/**
 * One Graph GET with a single 401 retry on a forced token.
 * SharePoint already does this; mailbox/scan were still sending a cached JWT
 * that Graph rejects as "Invalid token lifetime" while Tracker looks fine
 * because it can serve the one-hour Postgres cache.
 */
export async function graphFetch(
  url: string,
  init?: RequestInit,
  opts?: { force?: boolean },
): Promise<{ ok: boolean; status: number; raw: string }> {
  // Local tests only: GRAPH_TEST_BASE points every Graph call at a stub and skips the
  // token, so tests never touch the real mailbox. Ignored in production builds.
  const testBase =
    process.env.NODE_ENV !== 'production' ? (process.env.GRAPH_TEST_BASE || '').trim().replace(/\/+$/, '') : ''
  if (testBase) url = url.replace('https://graph.microsoft.com', testBase)

  async function run(force: boolean) {
    const token = testBase ? 'test-token' : await getMSToken({ force })
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${token}`)
    const res = await fetch(url, { ...init, cache: 'no-store', headers })
    const raw = await res.text()
    return { ok: res.ok, status: res.status, raw }
  }

  let last = await run(Boolean(opts?.force))
  if (!last.ok && isGraphAuthFailure(last.status, last.raw)) {
    resetMSTokenCache()
    last = await run(true)
  }
  return last
}

const BODY_CAP = 200_000

export function htmlToPlain(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function asPlainBody(content: string, contentType: string): string {
  const raw = content.slice(0, BODY_CAP)
  if ((contentType || 'text').toLowerCase() === 'html') return htmlToPlain(raw)
  return raw
}

export interface ReplyCheckResult {
  email: string
  replied: boolean
  reply_received_at: string | null
  subject: string | null
}

export async function checkReplies(sentEmails: { email: string; subject: string; sent_at: string }[]): Promise<ReplyCheckResult[]> {
  const results: ReplyCheckResult[] = []

  for (const sent of sentEmails) {
    try {
      const filter = encodeURIComponent(
        `from/emailAddress/address eq '${sent.email}' and receivedDateTime gt ${sent.sent_at}`
      )
      const res = await graphFetch(
        `https://graph.microsoft.com/v1.0/users/${process.env.OUTLOOK_USER_EMAIL}/messages?$filter=${filter}&$top=5&$select=subject,receivedDateTime,from`,
      )

      if (!res.ok) { results.push({ email: sent.email, replied: false, reply_received_at: null, subject: null }); continue }

      const data = JSON.parse(res.raw)
      const match = (data.value || []).find((msg: any) =>
        msg.subject?.toLowerCase().includes(sent.subject.toLowerCase().slice(0, 20))
      )

      results.push({
        email:             sent.email,
        replied:           !!match,
        reply_received_at: match?.receivedDateTime || null,
        subject:           match?.subject || null,
      })
    } catch {
      results.push({ email: sent.email, replied: false, reply_received_at: null, subject: null })
    }
  }

  return results
}

export interface ReplyMessage {
  id: string
  conversationId: string
  subject: string
  /** New text only. Quoted history is trimmed so a classifier does not read our own email back. */
  bodyText: string
  receivedDateTime: string
  fromEmail: string
  fromName: string
}

/** OData string literals escape a single quote by doubling it. */
export function odataString(value: string): string {
  return value.replace(/'/g, "''")
}

const QUOTE_MARKERS = [
  /^\s*-{2,}\s*Original Message\s*-{2,}/im,
  /^\s*_{5,}\s*$/m,
  /^\s*From:\s.+$/im,
  /^\s*On .{5,80}\bwrote:\s*$/im,
  /^\s*Sent from my /im,
]

/**
 * Drop the quoted thread below a reply. Graph returns the whole chain, and
 * feeding it to a classifier means classifying our own pitch alongside the
 * answer to it, which reliably reads as more positive than the reply is.
 *
 * ponytail: marker heuristics, not a MIME-aware parser. Handles Outlook, Gmail,
 * and iOS Mail. Upgrade path is Graph `uniqueBody`, which needs a per-message
 * fetch instead of one collection call per sender.
 */
export function stripQuotedHistory(text: string): string {
  let cut = text.length
  for (const marker of QUOTE_MARKERS) {
    const hit = marker.exec(text)
    if (hit && hit.index < cut) cut = hit.index
  }
  const head = text.slice(0, cut).trim()
  // If trimming leaves almost nothing, the markers probably misfired.
  return head.length >= 20 ? head : text.trim()
}

/**
 * Full reply messages per sender, for storage and classification.
 *
 * Unlike checkReplies this does not filter on subject. A message from that
 * address after we wrote to them is a reply, and matching on a subject prefix
 * misses every thread where the investor renamed it or replied from a phone.
 */
export async function fetchReplies(
  sent: { email: string; sent_at: string }[],
  perSender = 5,
): Promise<{ byEmail: Map<string, ReplyMessage[]>; errors: string[] }> {
  const user = process.env.OUTLOOK_USER_EMAIL || ''
  const byEmail = new Map<string, ReplyMessage[]>()
  const errors: string[] = []

  for (const s of sent) {
    const address = s.email.trim()
    if (!address) continue
    try {
      const filter = `from/emailAddress/address eq '${odataString(address)}' and receivedDateTime gt ${s.sent_at}`
      const qs = new URLSearchParams({
        $filter: filter,
        $top: String(Math.min(Math.max(perSender, 1), 20)),
        $orderby: 'receivedDateTime desc',
        $select: 'id,conversationId,subject,receivedDateTime,from,body,bodyPreview',
      })
      const res = await graphFetch(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(user)}/messages?${qs}`,
        {
          headers: {
            Prefer: 'outlook.body-content-type="text"',
          },
        },
      )
      if (!res.ok) {
        errors.push(`${address}: Graph ${res.status}`)
        continue
      }
      const data = JSON.parse(res.raw)
      const messages: ReplyMessage[] = (data.value || []).map((m: any) => {
        const raw =
          (typeof m.body?.content === 'string' && m.body.content) ||
          (typeof m.bodyPreview === 'string' && m.bodyPreview) ||
          ''
        return {
          id: String(m.id || ''),
          conversationId: String(m.conversationId || ''),
          subject: String(m.subject || ''),
          bodyText: stripQuotedHistory(raw),
          receivedDateTime: String(m.receivedDateTime || ''),
          fromEmail: String(m.from?.emailAddress?.address || address),
          fromName: String(m.from?.emailAddress?.name || ''),
        }
      })
      if (messages.length) byEmail.set(address.toLowerCase(), messages)
    } catch (err) {
      errors.push(`${address}: ${err instanceof Error ? err.message : 'fetch failed'}`)
    }
  }

  return { byEmail, errors }
}

export interface InboxMessageRow {
  id: string
  subject: string
  receivedDateTime: string
  fromName: string
  fromAddress: string
  isRead: boolean
  preview: string
  hasAttachments: boolean
}

export type InboxMessageDetail = InboxMessageRow & {
  bodyText: string
  to: { name: string; address: string }[]
  cc: { name: string; address: string }[]
}

function azureMailConfigured(): boolean {
  return Boolean(
    process.env.OUTLOOK_USER_EMAIL &&
      process.env.AZURE_TENANT_ID &&
      process.env.AZURE_CLIENT_ID &&
      process.env.AZURE_CLIENT_SECRET,
  )
}

function graphPerson(raw: unknown): { name: string; address: string } {
  const obj = raw as { emailAddress?: { name?: string; address?: string } } | null
  return {
    name: obj?.emailAddress?.name || '',
    address: (obj?.emailAddress?.address || '').toLowerCase().trim(),
  }
}

export async function listInboxMessages(top: number = 30): Promise<{
  messages: InboxMessageRow[]
  error: string | null
}> {
  const user = process.env.OUTLOOK_USER_EMAIL
  if (!azureMailConfigured() || !user) {
    return {
      messages: [],
      error: 'Outlook/Azure is not fully configured (.env.local: Azure + OUTLOOK_USER_EMAIL).',
    }
  }

  const clamp = Math.min(Math.max(top, 1), 50)

  try {
    const qs = new URLSearchParams({
      $top: String(clamp),
      $orderby: 'receivedDateTime desc',
      $select: 'id,subject,receivedDateTime,from,isRead,bodyPreview,hasAttachments',
    })
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
      user
    )}/mailFolders/inbox/messages?${qs}`

    // Fresh token first, same as SharePoint: mailbox is one call, not worth a 401 round-trip.
    const res = await graphFetch(url, undefined, { force: true })

    if (!res.ok) {
      let graphMsg = ''
      let graphCode = ''
      try {
        const err = JSON.parse(res.raw) as { error?: { code?: string; message?: string } }
        graphCode = err.error?.code || ''
        graphMsg = (err.error?.message || '').slice(0, 280)
      } catch {
        /* non-JSON body */
      }

      if (res.status === 403) {
        const msg =
          graphCode === 'ErrorAccessDenied'
            ? [
                'Inbox denied (403 / ErrorAccessDenied). Mail.Read on the app registration is OK; Graph is still refusing the mailbox.',
                'Verify AZURE_CLIENT_ID, AZURE_TENANT_ID, and AZURE_CLIENT_SECRET in .env.local are for that exact app; OUTLOOK_USER_EMAIL must be the mailbox user’s UPN in that same tenant.',
                'If everything matches, Exchange Online Application Access Policy often blocks app-only mail—a tenant Exchange admin needs to review or scope access for your app’s client id.',
              ].join(' ')
            : graphMsg || 'Mailbox access forbidden (403).'
        return { messages: [], error: msg }
      }

      if (res.status === 401 && isGraphAuthFailure(res.status, res.raw)) {
        return {
          messages: [],
          error:
            'Outlook token was rejected (invalid lifetime) even after a fresh request. Check that this machine’s clock is close to UTC, then retry.',
        }
      }

      return {
        messages: [],
        error: graphMsg || `Microsoft Graph error ${res.status}.`,
      }
    }

    let data: { value?: any[] }
    try {
      data = JSON.parse(res.raw)
    } catch {
      return { messages: [], error: 'Invalid response from Microsoft Graph.' }
    }

    const messages: InboxMessageRow[] = (data.value || []).map((m: any) => ({
      id: String(m.id),
      subject: typeof m.subject === 'string' && m.subject.trim() ? m.subject : '(no subject)',
      receivedDateTime: m.receivedDateTime || '',
      fromName: m.from?.emailAddress?.name || '',
      fromAddress: m.from?.emailAddress?.address || '',
      isRead: Boolean(m.isRead),
      preview: typeof m.bodyPreview === 'string' ? m.bodyPreview : '',
      hasAttachments: Boolean(m.hasAttachments),
    }))

    return { messages, error: null }
  } catch (e: any) {
    return {
      messages: [],
      error: e?.message || 'Could not reach Microsoft Graph.',
    }
  }
}

export async function getInboxMessage(id: string): Promise<{
  message: InboxMessageDetail | null
  error: string | null
}> {
  const user = process.env.OUTLOOK_USER_EMAIL
  if (!azureMailConfigured() || !user) {
    return {
      message: null,
      error: 'Outlook/Azure is not fully configured (.env.local: Azure + OUTLOOK_USER_EMAIL).',
    }
  }

  const trimmed = id.trim()
  if (!trimmed || trimmed.length > 2048) {
    return { message: null, error: 'Missing or invalid message id.' }
  }

  try {
    const qs = new URLSearchParams({
      $select:
        'id,subject,receivedDateTime,from,toRecipients,ccRecipients,isRead,hasAttachments,body,bodyPreview',
    })
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
      user,
    )}/messages/${encodeURIComponent(trimmed)}?${qs}`

    const res = await graphFetch(
      url,
      { headers: { Prefer: 'outlook.body-content-type="text"' } },
      { force: true },
    )

    if (!res.ok) {
      if (res.status === 401 && isGraphAuthFailure(res.status, res.raw)) {
        return {
          message: null,
          error:
            'Outlook token was rejected (invalid lifetime) even after a fresh request. Check that this machine’s clock is close to UTC, then retry.',
        }
      }
      return {
        message: null,
        error: graphErrorMessage(res.raw, `Microsoft Graph error ${res.status}.`),
      }
    }

    let m: Record<string, unknown>
    try {
      m = JSON.parse(res.raw) as Record<string, unknown>
    } catch {
      return { message: null, error: 'Invalid response from Microsoft Graph.' }
    }

    const body = m.body as { content?: string; contentType?: string } | undefined
    const bodyRaw =
      (typeof body?.content === 'string' && body.content) ||
      (typeof m.bodyPreview === 'string' && m.bodyPreview) ||
      ''

    return {
      message: {
        id: String(m.id || trimmed),
        subject: typeof m.subject === 'string' && m.subject.trim() ? m.subject : '(no subject)',
        receivedDateTime: typeof m.receivedDateTime === 'string' ? m.receivedDateTime : '',
        fromName: graphPerson(m.from).name,
        fromAddress: graphPerson(m.from).address,
        isRead: Boolean(m.isRead),
        preview: typeof m.bodyPreview === 'string' ? m.bodyPreview : '',
        hasAttachments: Boolean(m.hasAttachments),
        bodyText: asPlainBody(bodyRaw, body?.contentType || 'text'),
        to: Array.isArray(m.toRecipients)
          ? m.toRecipients.map(graphPerson).filter(p => p.address)
          : [],
        cc: Array.isArray(m.ccRecipients)
          ? m.ccRecipients.map(graphPerson).filter(p => p.address)
          : [],
      },
      error: null,
    }
  } catch (e: unknown) {
    return {
      message: null,
      error: e instanceof Error ? e.message : 'Could not reach Microsoft Graph.',
    }
  }
}

export type GraphMailRow = {
  id: string
  subject: string
  receivedDateTime: string
  sentDateTime: string
  fromName: string
  fromAddress: string
  to: { name: string; address: string }[]
  cc: { name: string; address: string }[]
  preview: string
  conversationId: string
  internetMessageId: string
  isDraft: boolean
}

/**
 * Page a mail folder newest-first. Caps pages so a scan cannot hang the request.
 * Incremental: pass afterIso (Graph receivedDateTime ge).
 */
export async function listMailFolderMessages(opts: {
  folder: 'inbox' | 'sentitems'
  afterIso?: string
  top?: number
  maxPages?: number
}): Promise<{ messages: GraphMailRow[]; error: string | null; truncated: boolean }> {
  const user = process.env.OUTLOOK_USER_EMAIL
  if (!azureMailConfigured() || !user) {
    return {
      messages: [],
      error: 'Outlook/Azure is not fully configured (.env.local: Azure + OUTLOOK_USER_EMAIL).',
      truncated: false,
    }
  }

  const top = Math.min(Math.max(opts.top ?? 50, 1), 50)
  const maxPages = Math.min(Math.max(opts.maxPages ?? 20, 1), 40)

  try {
    const qs = new URLSearchParams({
      $top: String(top),
      $orderby: 'receivedDateTime desc',
      $select:
        'id,subject,receivedDateTime,sentDateTime,from,toRecipients,ccRecipients,bodyPreview,conversationId,internetMessageId,isDraft',
    })
    if (opts.afterIso) {
      qs.set('$filter', `receivedDateTime ge ${opts.afterIso}`)
    }

    let url: string | null =
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(user)}/mailFolders/${opts.folder}/messages?${qs}`

    const messages: GraphMailRow[] = []
    let pages = 0
    let truncated = false

    while (url && pages < maxPages) {
      pages += 1
      const res = await graphFetch(url)
      if (!res.ok) {
        return {
          messages,
          error: graphErrorMessage(res.raw, `Microsoft Graph error ${res.status} on ${opts.folder}.`),
          truncated: messages.length > 0,
        }
      }
      let data: { value?: unknown[]; '@odata.nextLink'?: string }
      try {
        data = JSON.parse(res.raw) as { value?: unknown[]; '@odata.nextLink'?: string }
      } catch {
        return { messages, error: 'Invalid response from Microsoft Graph.', truncated: false }
      }
      for (const raw of data.value || []) {
        const m = raw as Record<string, unknown>
        if (m.isDraft) continue
        const from = graphPerson(m.from)
        messages.push({
          id: String(m.id || ''),
          subject: typeof m.subject === 'string' && m.subject.trim() ? m.subject : '(no subject)',
          receivedDateTime: typeof m.receivedDateTime === 'string' ? m.receivedDateTime : '',
          sentDateTime: typeof m.sentDateTime === 'string' ? m.sentDateTime : '',
          fromName: from.name,
          fromAddress: from.address,
          to: Array.isArray(m.toRecipients) ? m.toRecipients.map(graphPerson).filter(p => p.address) : [],
          cc: Array.isArray(m.ccRecipients) ? m.ccRecipients.map(graphPerson).filter(p => p.address) : [],
          preview: typeof m.bodyPreview === 'string' ? m.bodyPreview.slice(0, 400) : '',
          conversationId: typeof m.conversationId === 'string' ? m.conversationId : '',
          internetMessageId: typeof m.internetMessageId === 'string' ? m.internetMessageId : '',
          isDraft: false,
        })
      }
      url = data['@odata.nextLink'] || null
      if (url && pages >= maxPages) truncated = true
    }

    return { messages, error: null, truncated }
  } catch (e: unknown) {
    return {
      messages: [],
      error: e instanceof Error ? e.message : 'Could not reach Microsoft Graph.',
      truncated: false,
    }
  }
}
