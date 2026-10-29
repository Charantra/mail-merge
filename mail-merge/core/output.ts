/**
 * Merge outputs that need no mail server: a spreadsheet of messages, one .eml draft per
 * message (opens in Outlook, Apple Mail or Thunderbird ready to send), a zip of those,
 * and a printable document with one page per record (Word's "Edit Individual Documents").
 */
import * as XLSX from 'xlsx'
import { escapeHtml } from './template'
import type { MergedMessage } from './merge'

export interface Attachment {
  name: string
  type: string
  bytes: Uint8Array
}

export function messageRows(messages: MergedMessage[]): Record<string, string>[] {
  return messages.map(m => ({
    'Record #': String(m.record),
    'Sequence #': String(m.sequence),
    To: m.to.join('; '),
    CC: m.cc.join('; '),
    BCC: m.bcc.join('; '),
    Subject: m.subject,
    Body: m.body,
    Format: m.format,
    Attachments: m.attachments.join('; '),
    Warnings: m.issues.filter(i => i.level === 'warning').map(i => i.message).join('; '),
  }))
}

export function toCsv(rows: Record<string, string>[]): string {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  // BOM so Excel reads UTF-8 names correctly.
  return '﻿' + [headers.map(cell).join(','), ...rows.map(r => headers.map(h => cell(r[h] ?? '')).join(','))].join('\r\n')
}

export function toXlsx(rows: Record<string, string>[], sheet = 'Merged'): Uint8Array {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheet)
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
}

const utf8 = (s: string) => new TextEncoder().encode(s)

export function base64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...Array.from(bytes.subarray(i, i + 0x8000)))
  return btoa(bin)
}

function wrap76(s: string): string {
  return s.replace(/.{1,76}/g, '$&\r\n').trimEnd()
}

/** RFC 2047 encoded-word for headers that are not plain ASCII. */
function header(s: string): string {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${base64(utf8(s))}?=`
}

function fileParam(name: string): string {
  const safe = name.replace(/["\\\r\n]/g, '_')
  return /^[\x20-\x7e]*$/.test(safe) ? `filename="${safe}"` : `filename*=UTF-8''${encodeURIComponent(name)}`
}

function bodyHtml(m: MergedMessage): string {
  return /<html[\s>]/i.test(m.body) ? m.body : `<!doctype html><html><head><meta charset="utf-8"></head><body>${m.body}</body></html>`
}

/**
 * One message as an .eml file. `X-Unsent: 1` makes Outlook open it as a draft with a Send
 * button rather than as a received message.
 */
export function buildEml(m: MergedMessage, opts: { from?: string; attachments?: Attachment[]; date?: Date } = {}): string {
  const boundary = `----=_merge_${m.record}_${Math.random().toString(36).slice(2)}`
  const lines: string[] = []
  if (opts.from) lines.push(`From: ${header(opts.from)}`)
  lines.push(`To: ${m.to.join(', ')}`)
  if (m.cc.length) lines.push(`Cc: ${m.cc.join(', ')}`)
  if (m.bcc.length) lines.push(`Bcc: ${m.bcc.join(', ')}`)
  lines.push(`Subject: ${header(m.subject)}`)
  lines.push(`Date: ${(opts.date ?? new Date()).toUTCString()}`)
  lines.push('MIME-Version: 1.0', 'X-Unsent: 1')

  const type = m.format === 'html' ? 'text/html' : 'text/plain'
  const content = m.format === 'html' ? bodyHtml(m) : m.body.replace(/\r?\n/g, '\r\n')
  const bodyPart = [`Content-Type: ${type}; charset=UTF-8`, 'Content-Transfer-Encoding: base64', '', wrap76(base64(utf8(content)))]

  const files = opts.attachments ?? []
  if (!files.length) return [...lines, ...bodyPart, ''].join('\r\n')

  lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`, '', 'This is a multi-part message in MIME format.', '')
  lines.push(`--${boundary}`, ...bodyPart, '')
  for (const f of files) {
    lines.push(
      `--${boundary}`,
      `Content-Type: ${f.type || 'application/octet-stream'}; name="${f.name.replace(/["\\\r\n]/g, '_')}"`,
      `Content-Disposition: attachment; ${fileParam(f.name)}`,
      'Content-Transfer-Encoding: base64',
      '',
      wrap76(base64(f.bytes)),
      '',
    )
  }
  lines.push(`--${boundary}--`, '')
  return lines.join('\r\n')
}

/** Windows-safe file name for one message. */
export function emlName(m: MergedMessage): string {
  const who = (m.to[0] ?? 'no-address').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
  return `${String(m.sequence || m.record).padStart(4, '0')} - ${who}.eml`
}

const CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** A stored (uncompressed) zip. Enough for a folder of .eml files, with no dependency. */
export function zip(entries: { name: string; data: Uint8Array | string }[], date = new Date()): Uint8Array {
  const time = ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xffff
  const day = (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const e of entries) {
    const name = utf8(e.name)
    const data = typeof e.data === 'string' ? utf8(e.data) : e.data
    const crc = crc32(data)

    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, 0x0800, true) // UTF-8 names
    lv.setUint16(10, time, true)
    lv.setUint16(12, day, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, data.length, true)
    lv.setUint32(22, data.length, true)
    lv.setUint16(26, name.length, true)
    local.set(name, 30)
    locals.push(local, data)

    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(12, time, true)
    cv.setUint16(14, day, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, data.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    central.set(name, 46)
    centrals.push(central)

    offset += local.length + data.length
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)

  const parts = [...locals, ...centrals, end]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** One page per record, for printing or saving as PDF. */
export function printDocument(messages: MergedMessage[], opts: { title?: string; showHeaders?: boolean } = {}): string {
  const pages = messages
    .map(m => {
      const head = opts.showHeaders === false
        ? ''
        : `<table class="h"><tr><th>To</th><td>${escapeHtml(m.to.join(', '))}</td></tr>${
            m.cc.length ? `<tr><th>CC</th><td>${escapeHtml(m.cc.join(', '))}</td></tr>` : ''
          }<tr><th>Subject</th><td>${escapeHtml(m.subject)}</td></tr></table>`
      const body = m.format === 'html' ? m.body : `<div class="t">${escapeHtml(m.body)}</div>`
      return `<section>${head}${body}</section>`
    })
    .join('\n')
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(opts.title ?? 'Mail merge')}</title>
<style>
body{font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:#111;margin:0}
section{padding:40px 48px;page-break-after:always;break-after:page}
section:last-child{page-break-after:auto;break-after:auto}
.h{border-collapse:collapse;margin-bottom:20px;font-size:12px;color:#444}
.h th{text-align:left;padding:2px 12px 2px 0;font-weight:600}
.t{white-space:pre-wrap}
@media screen{section{border-bottom:1px dashed #ccc}}
</style></head><body>${pages}</body></html>`
}
