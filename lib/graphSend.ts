import { Attachment } from './types'
import { wrapEmailHtml } from './emailBody'
import { plainReplyComment } from './followupDays'
import {
  graphErrorMessage,
  graphFetch,
  htmlToPlain,
  odataString,
  stripQuotedHistory,
} from './outlook'

/** Docs: https://learn.microsoft.com/en-us/graph/outlook-immutable-id */
const IMMUTABLE = 'IdType="ImmutableId"'

const ATTACHMENT_LIMIT = 3 * 1024 * 1024

export type SentMessageIds = {
  graphMessageId: string
  internetMessageId: string
  conversationId: string
}

export type ConversationMessage = {
  id: string
  conversationId: string
  subject: string
  receivedDateTime: string
  sentDateTime: string
  fromEmail: string
  fromName: string
  toEmails: string[]
  isDraft: boolean
  internetMessageId: string
  bodyText: string
}

/** The outreach mailbox, unless a caller names another one (mail merge sends as a chosen team member). */
function mailbox(box?: string): string {
  if (box?.trim()) return box.trim()
  const user = process.env.OUTLOOK_USER_EMAIL?.trim()
  if (!user) throw new Error('OUTLOOK_USER_EMAIL is not set.')
  return user
}

function userPath(suffix: string, box?: string): string {
  return `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox(box))}${suffix}`
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function graphCall(
  method: string,
  url: string,
  body?: unknown,
  prefer = IMMUTABLE,
): Promise<Record<string, unknown> | null> {
  const headers: Record<string, string> = { Prefer: prefer }
  const init: RequestInit = { method, headers }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const res = await graphFetch(url, init)
  if (!res.ok) {
    const err = new Error(graphErrorMessage(res.raw, `Microsoft Graph ${res.status}.`)) as Error & {
      status?: number
    }
    err.status = res.status
    throw err
  }
  if (!res.raw) return null
  try {
    return JSON.parse(res.raw) as Record<string, unknown>
  } catch {
    throw new Error('Invalid response from Microsoft Graph.')
  }
}

function recipient(address: string, name: string) {
  return { emailAddress: { address: address.trim(), name: name.trim() || address.trim() } }
}

function addressesOf(list: unknown): string[] {
  if (!Array.isArray(list)) return []
  return list
    .map(row => {
      const addr = (row as { emailAddress?: { address?: string } })?.emailAddress?.address
      return typeof addr === 'string' ? addr.trim().toLowerCase() : ''
    })
    .filter(Boolean)
}

function person(raw: unknown): { name: string; address: string } {
  const obj = raw as { emailAddress?: { name?: string; address?: string } } | null
  return {
    name: obj?.emailAddress?.name || '',
    address: (obj?.emailAddress?.address || '').trim().toLowerCase(),
  }
}

function asMessage(raw: Record<string, unknown>): ConversationMessage {
  const from = person(raw.from)
  const body = raw.body as { content?: string; contentType?: string } | undefined
  const content = typeof body?.content === 'string' ? body.content : ''
  const preview = typeof raw.bodyPreview === 'string' ? raw.bodyPreview : ''
  const plain = content
    ? stripQuotedHistory(body?.contentType === 'text' ? content : htmlToPlain(content))
    : preview
  return {
    id: String(raw.id || ''),
    conversationId: typeof raw.conversationId === 'string' ? raw.conversationId : '',
    subject: typeof raw.subject === 'string' ? raw.subject : '',
    receivedDateTime: typeof raw.receivedDateTime === 'string' ? raw.receivedDateTime : '',
    sentDateTime: typeof raw.sentDateTime === 'string' ? raw.sentDateTime : '',
    fromEmail: from.address,
    fromName: from.name,
    toEmails: addressesOf(raw.toRecipients),
    isDraft: Boolean(raw.isDraft),
    internetMessageId: typeof raw.internetMessageId === 'string' ? raw.internetMessageId : '',
    bodyText: plain,
  }
}

function stamp(m: ConversationMessage): number {
  const t = Date.parse(m.sentDateTime || m.receivedDateTime || '')
  return Number.isFinite(t) ? t : 0
}

/**
 * Newest non-draft in the conversation.
 * Filter only: Graph rejects $orderby on a property that is not also in $filter.
 * https://learn.microsoft.com/en-us/graph/api/user-list-messages?view=graph-rest-1.0
 */
export async function listConversation(conversationId: string, box?: string): Promise<ConversationMessage[]> {
  const id = conversationId.trim()
  if (!id) throw new Error('Missing conversation id.')
  const qs = new URLSearchParams({
    $filter: `conversationId eq '${odataString(id)}'`,
    $top: '50',
    $select:
      'id,conversationId,subject,receivedDateTime,sentDateTime,from,toRecipients,isDraft,internetMessageId,body,bodyPreview',
  })
  const prefer = `${IMMUTABLE}, outlook.body-content-type="text"`
  const out: ConversationMessage[] = []
  let url: string | null = userPath(`/messages?${qs}`, box)
  for (let page = 0; url && page < 4; page++) {
    const headers: Record<string, string> = { Prefer: prefer }
    const res = await graphFetch(url, { headers })
    if (!res.ok) throw new Error(graphErrorMessage(res.raw, `Microsoft Graph ${res.status}.`))
    const data = JSON.parse(res.raw) as { value?: Record<string, unknown>[]; '@odata.nextLink'?: string }
    for (const row of data.value || []) out.push(asMessage(row))
    url = data['@odata.nextLink'] || null
  }
  return out
}

export function newestMessage(messages: ConversationMessage[]): ConversationMessage | null {
  const sent = messages.filter(m => m.id && !m.isDraft)
  sent.sort((a, b) => stamp(b) - stamp(a))
  return sent[0] || null
}

/** Inbound notes in this conversation, excluding mail we sent ourselves. */
export async function inboundInConversation(
  conversationId: string,
  sentAt: string,
  box?: string,
): Promise<ConversationMessage[]> {
  const mine = mailbox(box).toLowerCase()
  const after = Date.parse(sentAt)
  const rows = await listConversation(conversationId, box)
  return rows
    .filter(m => {
      if (m.isDraft || !m.id) return false
      if (!m.fromEmail || m.fromEmail === mine) return false
      if (Number.isFinite(after) && Date.parse(m.receivedDateTime) <= after) return false
      return true
    })
    .sort((a, b) => Date.parse(b.receivedDateTime) - Date.parse(a.receivedDateTime))
}

async function addAttachment(messageId: string, file: Attachment, box?: string): Promise<void> {
  const bytes = Buffer.from(file.content || '', 'base64')
  if (!file.name || bytes.length === 0) throw new Error(`Attachment ${file.name || '(unnamed)'} is empty.`)
  if (bytes.length >= ATTACHMENT_LIMIT) {
    throw new Error(`Attachment ${file.name} is 3 MB or larger. Graph file attachments must be under 3 MB.`)
  }
  await graphCall('POST', userPath(`/messages/${encodeURIComponent(messageId)}/attachments`, box), {
    '@odata.type': '#microsoft.graph.fileAttachment',
    name: file.name,
    contentType: file.mime_type || 'application/octet-stream',
    contentBytes: file.content,
  })
}

/**
 * ponytail: eight short reads, not a webhook. The sent copy can lag the send.
 * Upgrade path is a sent-items subscription if this still misses after the retries.
 * https://learn.microsoft.com/en-us/graph/outlook-immutable-id
 */
async function readSentCopy(graphMessageId: string, box?: string): Promise<SentMessageIds> {
  const url = userPath(
    `/messages/${encodeURIComponent(graphMessageId)}?$select=id,internetMessageId,conversationId,isDraft`,
    box,
  )
  let last = 'no response'
  for (let i = 0; i < 8; i++) {
    const res = await graphFetch(url, { headers: { Prefer: IMMUTABLE } })
    if (res.status === 404) {
      last = 'not in the mailbox yet'
    } else if (!res.ok) {
      throw new Error(graphErrorMessage(res.raw, `Microsoft Graph ${res.status}.`))
    } else {
      const row = JSON.parse(res.raw) as {
        id?: string
        internetMessageId?: string
        conversationId?: string
        isDraft?: boolean
      }
      if (row.internetMessageId && row.conversationId && row.isDraft === false) {
        return {
          graphMessageId: row.id || graphMessageId,
          internetMessageId: row.internetMessageId,
          conversationId: row.conversationId,
        }
      }
      last = 'conversation id is not on the sent copy yet'
    }
    await sleep(1500)
  }
  throw new Error(
    `Outlook accepted the send, but the conversation id is not readable yet (${last}). Graph message id: ${graphMessageId}`,
  )
}

/**
 * Graph definitely did not send the message: it failed before the send call, or
 * the send call itself was refused with a 4xx. Safe to release for a retry.
 * Any other error from a send function leaves the outcome unknown.
 */
export class GraphNotSentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GraphNotSentError'
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Run the steps before /send; any failure there means nothing left the mailbox. */
async function beforeSend<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    throw new GraphNotSentError(messageOf(err))
  }
}

async function sendDraft(draftId: string, box?: string): Promise<void> {
  try {
    await graphCall('POST', userPath(`/messages/${encodeURIComponent(draftId)}/send`, box))
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status && status >= 400 && status < 500) throw new GraphNotSentError(messageOf(err))
    throw err
  }
}

/** Create a draft in the outreach mailbox, send it, then read the sent copy. */
export async function sendFirstMessage(input: {
  toEmail: string
  toName: string
  subject: string
  htmlBody: string
  attachments?: Attachment[]
  cc?: { address: string; name: string }[]
  bcc?: { address: string; name: string }[]
  /** Mailbox to send from. Defaults to OUTLOOK_USER_EMAIL. */
  from?: string
}): Promise<SentMessageIds> {
  const toEmail = input.toEmail.trim()
  const box = input.from
  if (!toEmail) throw new GraphNotSentError('Missing recipient email.')
  const draftId = await beforeSend(async () => {
    const draft = await graphCall('POST', userPath('/messages', box), {
      subject: input.subject || '(no subject)',
      body: { contentType: 'HTML', content: wrapEmailHtml(input.htmlBody) },
      toRecipients: [recipient(toEmail, input.toName || toEmail)],
      ...(input.cc?.length
        ? { ccRecipients: input.cc.map(c => recipient(c.address, c.name)) }
        : {}),
      ...(input.bcc?.length
        ? { bccRecipients: input.bcc.map(c => recipient(c.address, c.name)) }
        : {}),
    })
    const id = typeof draft?.id === 'string' ? draft.id : ''
    if (!id) throw new Error('Microsoft Graph did not return a draft id.')
    for (const file of input.attachments || []) {
      await addAttachment(id, file, box)
    }
    return id
  })

  await sendDraft(draftId, box)
  return readSentCopy(draftId, box)
}

/**
 * Reply to the newest message in the conversation.
 * `comment` is only the new paragraph. createReply must not also set message.body,
 * or Graph returns 400. Outlook adds the quoted history.
 * https://learn.microsoft.com/en-us/graph/api/message-createreply?view=graph-rest-1.0
 * https://learn.microsoft.com/en-us/graph/api/message-reply?view=graph-rest-1.0
 */
export async function sendThreadReply(input: {
  conversationId: string
  toEmail: string
  toName: string
  comment: string
}): Promise<void> {
  const toEmail = input.toEmail.trim()
  const comment = plainReplyComment(input.comment)
  if (!toEmail) throw new GraphNotSentError('Missing recipient email.')
  if (!comment) throw new GraphNotSentError('Follow-up text is empty.')

  const draftId = await beforeSend(async () => {
    const target = newestMessage(await listConversation(input.conversationId))
    if (!target) throw new Error('No sent message in that Outlook conversation yet.')

    const draft = await graphCall(
      'POST',
      userPath(`/messages/${encodeURIComponent(target.id)}/createReply`),
      {
        comment,
        message: { toRecipients: [recipient(toEmail, input.toName || toEmail)] },
      },
    )
    const draftId = typeof draft?.id === 'string' ? draft.id : ''
    if (!draftId) throw new Error('Microsoft Graph did not return a reply draft id.')

    const want = toEmail.toLowerCase()
    const addressed = addressesOf(draft?.toRecipients)
    if (addressed.length !== 1 || addressed[0] !== want) {
      await graphCall('PATCH', userPath(`/messages/${encodeURIComponent(draftId)}`), {
        toRecipients: [recipient(toEmail, input.toName || toEmail)],
      })
    }

    return draftId
  })

  await sendDraft(draftId)
}
