import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { sendFirstMessage, GraphNotSentError } from '@/lib/graphSend'
import { suppressionFor, audit } from '@/lib/events'
import { beginSendRequest, completeSendRequest, type StoredSendResponse } from '@/lib/sendRequests'
import { getSessionFromRequest } from '@/lib/session-cookie'
import { BATCH_SIZE } from '@/lib/sendLimits'
import { trackingBase } from '@/lib/tracking'
import type { Attachment } from '@/lib/types'
import { ensureRun, insertSending, instrumentMergeHtml, markNotSent, markSent, newMessageId } from '@/lib/mailMergeStore'

/** send_requests needs a session id; mail merge sends belong to no mandate. */
const SCOPE = 'mail-merge'
const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:".]{2,}$/

type MergeMail = {
  index: number
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  body: string
  format: 'text' | 'html'
  attachments: Attachment[]
}

export type MergeSendResult = {
  index: number
  status: 'sent' | 'skipped' | 'failed' | 'unknown'
  message?: string
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Plain text keeps its line breaks; blank lines become paragraphs. */
function textToHtml(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(p => `<p style="margin:0 0 12px">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.map(x => String(x ?? '').trim()).filter(Boolean) : []
}

function parse(raw: unknown): MergeMail[] | null {
  if (!Array.isArray(raw)) return null
  return raw.map(m => {
    const o = (m ?? {}) as Record<string, unknown>
    return {
      index: Number(o.index),
      to: strings(o.to),
      cc: strings(o.cc),
      bcc: strings(o.bcc),
      subject: String(o.subject ?? '').trim(),
      body: String(o.body ?? ''),
      format: o.format === 'html' ? 'html' : 'text',
      attachments: Array.isArray(o.attachments)
        ? o.attachments.map(a => {
            const f = (a ?? {}) as Record<string, unknown>
            return { name: String(f.name ?? ''), content: String(f.content ?? ''), mime_type: String(f.mime_type ?? '') }
          })
        : [],
    }
  })
}

/** Which mailbox the merge sends from, so the screen can say so before anyone presses Send. */
/**
 * Mailboxes a person may send a merge from: their own, the outreach mailbox, and anyone listed
 * in MAIL_MERGE_SENDERS (comma separated). Nobody can type in a colleague who is not listed.
 */
function allowedSenders(operator: string): string[] {
  const listed = (process.env.MAIL_MERGE_SENDERS || '').split(/[,;\s]+/)
  const all = [operator, process.env.OUTLOOK_USER_EMAIL || '', ...listed].map(a => a.trim().toLowerCase()).filter(a => EMAIL.test(a))
  return Array.from(new Set(all))
}

/** The sender choices for this person, so the screen can offer them before anyone presses Send. */
export async function GET(req: NextRequest) {
  const operator = await getSessionFromRequest(req)
  if (!operator) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  return NextResponse.json({
    me: operator.toLowerCase(),
    senders: allowedSenders(operator),
    batch_size: BATCH_SIZE,
    tracking: trackingBase() !== null,
  })
}

/** Graph refuses a mailbox the app was not granted; say what to do about it. */
function explain(message: string, from: string): string {
  if (/ErrorAccessDenied|Access is denied|403|MailboxNotEnabled|ResourceNotFound|ErrorInvalidUser/i.test(message)) {
    return `Outlook would not send from ${from}. The mailbox may not exist, or a Microsoft 365 admin has not allowed this app to send from it. ${message}`
  }
  return message
}

/**
 * POST /api/mail-merge/send { messages } + Idempotency-Key header.
 *
 * Sends up to BATCH_SIZE merged messages through Outlook (Microsoft Graph), one at a time,
 * 300ms apart. The person confirmed the send on screen. Addresses on the suppression list are
 * skipped. A retry with the same key replays the first result and sends nothing again.
 */
export async function POST(req: NextRequest) {
  const operator = await getSessionFromRequest(req)
  if (!operator) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const key = req.headers.get('idempotency-key')?.trim() || ''
  if (!key || key.length > 200) {
    return NextResponse.json({ error: 'An Idempotency-Key header (1 to 200 characters) is required to send.' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  const messages = parse(body?.messages)
  if (!messages?.length) return NextResponse.json({ error: 'messages required' }, { status: 400 })
  if (messages.length > BATCH_SIZE) {
    return NextResponse.json({ error: `Batch cap exceeded. Max ${BATCH_SIZE} per send, got ${messages.length}.` }, { status: 400 })
  }

  // One run per press of Send, shared by its batches, so the tracker groups them.
  const runId = String(body?.run?.id ?? '').trim().slice(0, 100)
  const runName = String(body?.run?.name ?? '').trim() || 'Mail merge'
  if (!runId) return NextResponse.json({ error: 'run.id required' }, { status: 400 })

  const from = String(body?.from ?? operator).trim().toLowerCase()
  if (!allowedSenders(operator).includes(from)) {
    return NextResponse.json({ error: `You may not send from ${from}. Ask an admin to add it to MAIL_MERGE_SENDERS. Nothing was sent.` }, { status: 403 })
  }

  const requestHash = sha256(
    JSON.stringify({ runId, from, messages:messages.map(m => ({ ...m, attachments: m.attachments.map(a => [a.name, sha256(a.content)]) })) }),
  )
  let prior
  try {
    await ensureRun({ id: runId, name: runName, subject: messages[0].subject, mailbox: from, by: operator })
    prior = await beginSendRequest({ key, sessionId: SCOPE, by: operator, requestHash })
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    if (/send_requests|mail_merge_/.test(message)) {
      return NextResponse.json({ error: 'Mail merge tables are not set up yet. Run npm run db:migrate. Nothing was sent.' }, { status: 409 })
    }
    // Without the database there is no double-send protection, so refuse rather than send unguarded.
    if ((err as { code?: string }).code === 'ECONNREFUSED' || /ECONNREFUSED|connect|timeout/i.test(message)) {
      return NextResponse.json({ error: 'The database is not reachable, so send protection cannot run. Nothing was sent.' }, { status: 409 })
    }
    throw err
  }
  if (prior) {
    if (prior.request_hash !== requestHash || prior.session_id !== SCOPE) {
      return NextResponse.json({ error: 'This Idempotency-Key was already used for a different send.' }, { status: 422 })
    }
    if (prior.status !== 'completed' || !prior.response) {
      return NextResponse.json({ error: 'This batch is already being sent. Nothing was sent again.' }, { status: 409 })
    }
    return NextResponse.json(prior.response.body, { status: prior.response.status, headers: { 'Idempotent-Replayed': 'true' } })
  }

  const suppressed = await suppressionFor(messages.flatMap(m => [...m.to, ...m.cc, ...m.bcc]))
  const results: MergeSendResult[] = []

  // Set when Outlook refuses the sender mailbox itself: the rest of the batch would fail the same way.
  let mailboxRefused = ''
  for (const m of messages) {
    if (mailboxRefused) {
      results.push({ index: m.index, status: 'failed', message: mailboxRefused })
      continue
    }
    const all = [...m.to, ...m.cc, ...m.bcc]
    const blocked = all.find(a => suppressed.has(a.toLowerCase()))
    let refuse = ''
    if (m.to.length !== 1) refuse = m.to.length ? 'Outlook send takes one To address per message. Move the others to CC.' : 'No To address.'
    else if (all.some(a => !EMAIL.test(a))) refuse = 'Invalid email address.'
    else if (!m.subject) refuse = 'Subject is blank.'
    else if (!m.body.trim()) refuse = 'Body is blank.'
    else if (blocked) refuse = `${blocked} is on the suppression list (${suppressed.get(blocked.toLowerCase())}).`
    if (refuse) {
      results.push({ index: m.index, status: 'skipped', message: refuse })
      continue
    }

    if (results.some(r => r.status === 'sent')) await sleep(300)
    const id = newMessageId()
    const tracked = instrumentMergeHtml(m.format === 'html' ? m.body : textToHtml(m.body), id)
    try {
      await insertSending({ id, runId, record: m.index + 1, to: m.to[0], cc: m.cc, bcc: m.bcc, subject: m.subject, by: operator, tracking: tracked.enabled })
    } catch (err) {
      results.push({ index: m.index, status: 'failed', message: `Could not record the send, so it was not sent. ${err instanceof Error ? err.message : ''}` })
      continue
    }
    try {
      const ids = await sendFirstMessage({
        toEmail: m.to[0],
        toName: m.to[0],
        subject: m.subject,
        htmlBody: tracked.html,
        attachments: m.attachments,
        cc: m.cc.map(address => ({ address, name: address })),
        bcc: m.bcc.map(address => ({ address, name: address })),
        from,
      })
      results.push({ index: m.index, status: 'sent' })
      await markSent(id, ids).catch(() => {})
      await audit({
        actor: operator,
        action: 'mail_merge_send',
        targetType: 'email',
        targetId: m.to[0].toLowerCase(),
        detail: { from, subject: m.subject, cc: m.cc, bcc: m.bcc, attachments: m.attachments.map(a => a.name), graph_message_id: ids.graphMessageId },
      })
    } catch (err) {
      const message = explain(err instanceof Error ? err.message : String(err), from)
      // Anything other than a definite refusal may have left the mailbox: never retry it blind.
      const notSent = err instanceof GraphNotSentError
      results.push(
        notSent
          ? { index: m.index, status: 'failed', message }
          : { index: m.index, status: 'unknown', message: `Outcome unknown, check Sent Items before resending. ${message}` },
      )
      await markNotSent(id, notSent ? 'failed' : 'unknown', message).catch(() => {})
      if (notSent && message.startsWith('Outlook would not send from')) mailboxRefused = message
    }
  }

  const stored: StoredSendResponse = { status: 200, body: { results } }
  await completeSendRequest(key, stored)
  return NextResponse.json(stored.body)
}
