/**
 * Mail merge sends and their tracking. Kept apart from outreach on purpose: its own
 * tables (migration 0008), its own pixel and click routes (/mm/o/, /mm/c/), and its own
 * reply check. Nothing here touches outreach rows, email_events or the outreach tracker.
 *
 * Opens and clicks need a public https APP_PUBLIC_URL (see lib/tracking.ts), so they are
 * off on localhost. Replies and bounces are read from the Outlook mailbox and work anywhere.
 */
import { randomUUID } from 'crypto'
import { query, queryOne } from './db'
import { makeToken, trackingBase } from './tracking'
import { inboundInConversation } from './graphSend'
import { graphFetch, odataString } from './outlook'
import { classifyInbound } from './tracker/classify'

export type MergeMessageRow = {
  id: string
  run_id: string
  record: number | null
  to_email: string
  cc: string[]
  bcc: string[]
  subject: string
  status: 'sending' | 'sent' | 'failed' | 'unknown'
  error: string | null
  sent_by: string
  sent_at: string | null
  conversation_id: string | null
  tracking: boolean
  open_count: number
  machine_open_count: number
  first_opened_at: string | null
  last_opened_at: string | null
  click_count: number
  machine_click_count: number
  first_clicked_at: string | null
  last_clicked_at: string | null
  clicked_urls: string[]
  replied_at: string | null
  reply_from: string | null
  reply_snippet: string | null
  reply_count: number
  auto_reply_at: string | null
  bounced_at: string | null
  bounce_reason: string | null
  checked_at: string | null
}

export function newMessageId(): string {
  return `mm_${randomUUID()}`
}

export async function ensureRun(input: { id: string; name: string; subject: string; mailbox: string; by: string }): Promise<void> {
  await query(
    `INSERT INTO mail_merge_runs (id, name, subject, mailbox, tracking, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO NOTHING`,
    [input.id, input.name.slice(0, 200), input.subject.slice(0, 500), input.mailbox, trackingBase() !== null, input.by],
  )
}

/** Written before the Outlook call, so a send whose outcome is unknown still has a row. */
export async function insertSending(input: {
  id: string
  runId: string
  record: number
  to: string
  cc: string[]
  bcc: string[]
  subject: string
  by: string
  tracking: boolean
}): Promise<void> {
  await query(
    `INSERT INTO mail_merge_messages (id, run_id, record, to_email, cc, bcc, subject, sent_by, tracking)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [input.id, input.runId, input.record, input.to, input.cc, input.bcc, input.subject, input.by, input.tracking],
  )
}

export async function markSent(id: string, ids: { graphMessageId: string; internetMessageId: string; conversationId: string }): Promise<void> {
  await query(
    `UPDATE mail_merge_messages
        SET status = 'sent', sent_at = now(), graph_message_id = $2, internet_message_id = $3, conversation_id = $4
      WHERE id = $1`,
    [id, ids.graphMessageId, ids.internetMessageId, ids.conversationId],
  )
}

export async function markNotSent(id: string, status: 'failed' | 'unknown', error: string): Promise<void> {
  await query(
    `UPDATE mail_merge_messages SET status = $2, error = $3, sent_at = CASE WHEN $2 = 'unknown' THEN now() ELSE sent_at END
      WHERE id = $1`,
    [id, status, error.slice(0, 1000)],
  )
}

// ── Opens and clicks ───────────────────────────────────────────

/**
 * Route every http(s) link through /mm/c/ and append the /mm/o/ pixel.
 * Unchanged when there is no public https base to point them at.
 */
export function instrumentMergeHtml(html: string, messageId: string): { html: string; enabled: boolean } {
  const base = trackingBase()
  if (!base) return { html, enabled: false }
  const linked = html.replace(/(<a\b[^>]*?\bhref=")(https?:\/\/[^"]+)(")/gi, (_m, pre, url, post) => {
    const real = String(url).replace(/&amp;/g, '&')
    return `${pre}${base}/mm/c/${makeToken({ o: messageId, u: real })}${post}`
  })
  const pixel = `<img src="${base}/mm/o/${makeToken({ o: messageId })}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0" />`
  return { html: `${linked}${pixel}`, enabled: true }
}

export async function sentAt(id: string): Promise<string | null> {
  const row = await queryOne<{ sent_at: string | null }>(`SELECT sent_at FROM mail_merge_messages WHERE id = $1`, [id])
  return row?.sent_at ?? null
}

export async function recordOpen(id: string, machine: boolean): Promise<void> {
  await query(
    machine
      ? `UPDATE mail_merge_messages SET machine_open_count = machine_open_count + 1 WHERE id = $1`
      : `UPDATE mail_merge_messages
            SET open_count = open_count + 1, first_opened_at = COALESCE(first_opened_at, now()), last_opened_at = now()
          WHERE id = $1`,
    [id],
  )
}

export async function recordClick(id: string, url: string, machine: boolean): Promise<void> {
  await query(
    machine
      ? `UPDATE mail_merge_messages SET machine_click_count = machine_click_count + 1 WHERE id = $1`
      : `UPDATE mail_merge_messages
            SET click_count = click_count + 1, first_clicked_at = COALESCE(first_clicked_at, now()), last_clicked_at = now(),
                clicked_urls = CASE WHEN $2 = ANY(clicked_urls) THEN clicked_urls ELSE array_append(clicked_urls, $2) END,
                -- A click means the email was opened, even when images were blocked.
                first_opened_at = COALESCE(first_opened_at, now())
          WHERE id = $1`,
    machine ? [id] : [id, url.slice(0, 1000)],
  )
}

// ── Reading for the tracker ────────────────────────────────────

export type RunSummary = {
  id: string
  name: string
  subject: string
  mailbox: string
  tracking: boolean
  created_by: string
  created_at: string
  sent: number
  failed: number
  opened: number
  clicked: number
  replied: number
  bounced: number
}

export async function listRuns(): Promise<RunSummary[]> {
  return query<RunSummary>(
    `SELECT r.id, r.name, r.subject, r.mailbox, r.tracking, r.created_by, r.created_at,
            count(*) FILTER (WHERE m.status IN ('sent','unknown'))::int AS sent,
            count(*) FILTER (WHERE m.status = 'failed')::int AS failed,
            count(*) FILTER (WHERE m.first_opened_at IS NOT NULL)::int AS opened,
            count(*) FILTER (WHERE m.click_count > 0)::int AS clicked,
            count(*) FILTER (WHERE m.replied_at IS NOT NULL)::int AS replied,
            count(*) FILTER (WHERE m.bounced_at IS NOT NULL)::int AS bounced
       FROM mail_merge_runs r
       LEFT JOIN mail_merge_messages m ON m.run_id = r.id
      GROUP BY r.id
      ORDER BY r.created_at DESC
      LIMIT 200`,
  )
}

export async function messagesForRun(runId: string): Promise<MergeMessageRow[]> {
  return query<MergeMessageRow>(`SELECT * FROM mail_merge_messages WHERE run_id = $1 ORDER BY record NULLS LAST, created_at`, [runId])
}

// ── Replies and bounces ────────────────────────────────────────

const REPLY_WINDOW_DAYS = 45
const MAX_CHECK = 150

function isDaemon(address: string): boolean {
  return /^(mailer-daemon|postmaster|microsoftexchange)/i.test(address.split('@')[0] || '')
}

/** Exchange "Undeliverable" notices that did not land in the original conversation. */
async function undeliverableSince(sinceIso: string, mailbox: string): Promise<{ at: string; text: string }[]> {
  const user = mailbox.trim()
  if (!user) return []
  const qs = new URLSearchParams({
    $filter: `receivedDateTime gt ${sinceIso} and startswith(subject,'${odataString('Undeliverable')}')`,
    $top: '50',
    $select: 'receivedDateTime,body,bodyPreview',
  })
  const res = await graphFetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(user)}/messages?${qs}`, {
    headers: { Prefer: 'outlook.body-content-type="text"' },
  })
  if (!res.ok) return []
  const data = JSON.parse(res.raw) as { value?: { receivedDateTime: string; body?: { content?: string }; bodyPreview?: string }[] }
  return (data.value || []).map(m => ({ at: m.receivedDateTime, text: `${m.body?.content || ''} ${m.bodyPreview || ''}`.toLowerCase() }))
}

export type ReplyCheckResult = { checked: number; replied: number; bounced: number; auto_replies: number; errors: string[] }

/**
 * Read each sent merge email's Outlook conversation for replies, out-of-office notes and
 * bounces. Read only: nothing is sent, and nothing outside the mail merge tables changes.
 */
export async function checkReplies(runId?: string): Promise<ReplyCheckResult> {
  // Each run was sent from its own mailbox, so its replies are read there.
  const rows = await query<MergeMessageRow & { mailbox: string }>(
    `SELECT m.*, r.mailbox FROM mail_merge_messages m JOIN mail_merge_runs r ON r.id = m.run_id
      WHERE m.status = 'sent' AND m.conversation_id IS NOT NULL
        AND m.sent_at > now() - make_interval(days => $2)
        AND ($1::text IS NULL OR m.run_id = $1)
      ORDER BY m.checked_at NULLS FIRST, m.sent_at DESC
      LIMIT $3`,
    [runId ?? null, REPLY_WINDOW_DAYS, MAX_CHECK],
  )
  const out: ReplyCheckResult = { checked: 0, replied: 0, bounced: 0, auto_replies: 0, errors: [] }
  if (!rows.length) return out

  const notices = new Map<string, { at: string; text: string }[]>()
  for (const box of Array.from(new Set(rows.map(r => r.mailbox)))) {
    const earliest = Math.min(...rows.filter(r => r.mailbox === box).map(r => new Date(r.sent_at!).getTime()))
    notices.set(box, await undeliverableSince(new Date(earliest).toISOString(), box).catch(() => []))
  }

  for (const r of rows) {
    try {
      const inbound = await inboundInConversation(r.conversation_id!, new Date(r.sent_at!).toISOString(), r.mailbox)
      let replied: (typeof inbound)[number][] = []
      let bounceAt: string | null = null
      let bounceReason: string | null = null
      let autoAt: string | null = null
      for (const m of inbound) {
        const kind = classifyInbound(m.subject, m.bodyText.slice(0, 600))
        if (isDaemon(m.fromEmail) || kind === 'Bounced') {
          bounceAt ??= m.receivedDateTime
          bounceReason ??= m.subject
        } else if (kind === 'OOO') {
          autoAt ??= m.receivedDateTime
        } else {
          replied.push(m)
        }
      }
      if (!bounceAt) {
        const to = r.to_email.toLowerCase()
        const hit = (notices.get(r.mailbox) ?? []).find(n => n.text.includes(to) && new Date(n.at) > new Date(r.sent_at!))
        if (hit) {
          bounceAt = hit.at
          bounceReason = 'Undeliverable notice in the mailbox'
        }
      }
      // inboundInConversation returns newest first.
      replied = replied.sort((a, b) => a.receivedDateTime.localeCompare(b.receivedDateTime))
      const first = replied[0]
      const last = replied[replied.length - 1]
      await query(
        `UPDATE mail_merge_messages
            SET replied_at = COALESCE(replied_at, $2::timestamptz),
                reply_from = COALESCE($3, reply_from),
                reply_snippet = COALESCE($4, reply_snippet),
                reply_count = GREATEST(reply_count, $5),
                auto_reply_at = COALESCE(auto_reply_at, $6::timestamptz),
                bounced_at = COALESCE(bounced_at, $7::timestamptz),
                bounce_reason = COALESCE(bounce_reason, $8),
                checked_at = now()
          WHERE id = $1`,
        [
          r.id,
          first?.receivedDateTime ?? null,
          last?.fromEmail ?? null,
          last ? last.bodyText.replace(/\s+/g, ' ').trim().slice(0, 300) : null,
          replied.length,
          autoAt,
          bounceAt,
          bounceReason,
        ],
      )
      out.checked++
      if (replied.length && !r.replied_at) out.replied++
      if (bounceAt && !r.bounced_at) out.bounced++
      if (autoAt && !r.auto_reply_at) out.auto_replies++
    } catch (err) {
      out.errors.push(`${r.to_email}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return out
}
