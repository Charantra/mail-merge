/**
 * Finish & Merge: one message per record, with the problems Word's "Check for Errors" would raise.
 * Errors block a message from being exported or sent; warnings do not.
 */
import { lookup, hasColumn, type Row } from './fields'
import { isValidEmail, splitAddresses } from './data'
import { escapeHtml, parseTemplate, position, render, type Template } from './template'

export type BodyFormat = 'text' | 'html'

export interface MergeSettings {
  /** Column that holds the To address. */
  toColumn: string
  /** Templates, so they can be a fixed address or a field such as {{Assistant Email}}. */
  cc: string
  bcc: string
  subject: string
  body: string
  format: BodyFormat
  /** Column listing per-record attachment file names, separated by ; or ,. */
  attachmentColumn: string
  /** Answers to the template's Fill-in prompts. */
  fills: Record<string, string>
  /** Merge only the first record for each To address. */
  skipDuplicates: boolean
}

export const EMPTY_SETTINGS: MergeSettings = {
  toColumn: '',
  cc: '',
  bcc: '',
  subject: '',
  body: '',
  format: 'text',
  attachmentColumn: '',
  fills: {},
  skipDuplicates: true,
}

export interface Issue {
  level: 'error' | 'warning'
  message: string
}

export interface MergedMessage {
  /** Data source row index (0-based) this message came from. */
  index: number
  /** Merge Record # (1-based data source position). */
  record: number
  /** Merge Sequence #, 0 when skipped. */
  sequence: number
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  body: string
  format: BodyFormat
  /** Per-record attachment names from the attachment column. */
  attachments: string[]
  issues: Issue[]
  /** Set when the record is left out of the merge, with the reason. */
  skipped?: string
}

export interface Compiled {
  subject: Template
  body: Template
  cc: Template
  bcc: Template
  /** Template problems, each naming where it is. Any of these blocks the merge. */
  errors: string[]
  /** Fields the templates use that are not columns of the data source. */
  unknownFields: string[]
  fills: string[]
}

export function compile(settings: MergeSettings, headers: string[]): Compiled {
  const parts = {
    subject: parseTemplate(settings.subject),
    body: parseTemplate(settings.body),
    cc: parseTemplate(settings.cc),
    bcc: parseTemplate(settings.bcc),
  }
  const src = { subject: settings.subject, body: settings.body, cc: settings.cc, bcc: settings.bcc }
  const label = { subject: 'Subject', body: 'Body', cc: 'CC', bcc: 'BCC' }
  const errors: string[] = []
  const fields: string[] = []
  const fills: string[] = []
  for (const key of ['subject', 'body', 'cc', 'bcc'] as const) {
    for (const e of parts[key].errors) {
      const p = position(src[key], e.at)
      errors.push(`${label[key]}, line ${p.line}: ${e.message}`)
    }
    fields.push(...parts[key].fields)
    for (const f of parts[key].fills) if (!fills.includes(f)) fills.push(f)
  }
  if (!settings.subject.trim()) errors.push('Subject is empty')
  if (!settings.body.trim()) errors.push('Body is empty')
  const unknownFields = Array.from(new Set(fields.filter(f => !hasColumn(headers, f))))
  return { ...parts, errors, unknownFields, fills }
}

export interface MergeOptions {
  /** Names of the attachment files available, for matching the attachment column. */
  availableFiles?: string[]
  now?: Date
}

/**
 * Merge the given rows, in the given order. `order` holds data source indices of the records
 * to merge (already filtered, sorted and ticked), exactly as the recipient list shows them.
 */
export function mergeRecords(
  rows: Row[],
  order: number[],
  settings: MergeSettings,
  compiled: Compiled,
  options: MergeOptions = {},
): MergedMessage[] {
  const files = new Set((options.availableFiles ?? []).map(f => f.toLowerCase()))
  const seen = new Set<string>()
  const escape = settings.format === 'html' ? escapeHtml : undefined
  let sequence = 0

  return order.map(index => {
    const row = rows[index]
    const issues: Issue[] = []
    const to = splitAddresses(lookup(row, settings.toColumn) ?? '')
    const key = to.map(a => a.toLowerCase()).sort().join(';')
    const duplicate = settings.skipDuplicates && !!key && seen.has(key)
    if (key) seen.add(key)
    const seq = duplicate ? 0 : ++sequence

    const ctx = { row, record: index + 1, sequence: seq, fills: settings.fills, now: options.now }
    const subject = render(compiled.subject, ctx)
    const body = render(compiled.body, { ...ctx, escape })
    const cc = splitAddresses(render(compiled.cc, ctx).text)
    const bcc = splitAddresses(render(compiled.bcc, ctx).text)

    if (!settings.toColumn) issues.push({ level: 'error', message: 'No email column chosen' })
    else if (!to.length) issues.push({ level: 'error', message: `No address in "${settings.toColumn}"` })
    for (const a of to) if (!isValidEmail(a)) issues.push({ level: 'error', message: `Invalid To address "${a}"` })
    for (const a of [...cc, ...bcc]) if (!isValidEmail(a)) issues.push({ level: 'error', message: `Invalid CC/BCC address "${a}"` })
    const subjectText = subject.text.replace(/\s*[\r\n]+\s*/g, ' ').trim()
    if (!subjectText) issues.push({ level: 'error', message: 'Subject is blank after merging' })

    const blank = Array.from(new Set([...subject.blank, ...body.blank]))
    if (blank.length) issues.push({ level: 'warning', message: `Blank field${blank.length > 1 ? 's' : ''}: ${blank.join(', ')}` })

    const attachments = settings.attachmentColumn ? splitAddresses(lookup(row, settings.attachmentColumn) ?? '') : []
    for (const name of attachments)
      if (!files.has(name.toLowerCase())) issues.push({ level: 'error', message: `Attachment "${name}" was not added` })

    return {
      index,
      record: index + 1,
      sequence: seq,
      to,
      cc,
      bcc,
      subject: subjectText,
      body: body.text,
      format: settings.format,
      attachments,
      issues,
      skipped: duplicate ? `Duplicate of an earlier record for ${to.join(', ')}` : undefined,
    }
  })
}

/** Messages that will actually go out: not skipped and with no errors. */
export function ready(messages: MergedMessage[]): MergedMessage[] {
  return messages.filter(m => !m.skipped && !m.issues.some(i => i.level === 'error'))
}
