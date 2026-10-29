/**
 * The recipient list: reading Excel / CSV / pasted tables, plus the "Edit Recipient List"
 * operations (filter, sort, find duplicates, validate addresses).
 */
import * as XLSX from 'xlsx'
import { evaluate, type Comparison, type Condition, type Op } from './conditions'
import { fieldKey, lookup, type Row } from './fields'

export interface Dataset {
  headers: string[]
  rows: Row[]
}

export interface Workbook {
  sheets: string[]
  /** Raw cell text of one sheet, row by row. */
  matrix: (sheet: string) => string[][]
}

/** Column letters, as Word names columns of a sheet without a header row. */
export function columnName(i: number): string {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

/** RFC 4180 CSV with the delimiter guessed from the first line (comma, tab or semicolon). */
export function parseDelimited(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const firstLine = src.split(/\r?\n/, 1)[0] ?? ''
  const delim =
    delimiter ??
    ([',', '\t', ';'] as const).reduce((best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best), ',' as string)

  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === delim) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  return d.getHours() || d.getMinutes() ? `${date} ${p(d.getHours())}:${p(d.getMinutes())}` : date
}

/** Excel (.xlsx, .xls, .ods) through SheetJS. Dates come out as ISO text, other cells as displayed. */
export function readWorkbook(data: ArrayBuffer | Uint8Array): Workbook {
  const wb = XLSX.read(data, { type: 'array', cellDates: true })
  return {
    sheets: wb.SheetNames,
    matrix: sheet => {
      const ws = wb.Sheets[sheet]
      if (!ws) return []
      for (const [addr, cell] of Object.entries(ws)) {
        if (addr.startsWith('!')) continue
        const c = cell as XLSX.CellObject
        if (c.t === 'd' && c.v instanceof Date) c.w = isoDate(c.v)
      }
      return XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '', blankrows: false }).map(r =>
        r.map(v => (v == null ? '' : String(v))),
      )
    },
  }
}

/**
 * Turn a cell matrix into rows keyed by header. Blank rows are dropped, blank or repeated
 * headers get a unique name, and with `headerRow` off the columns are named A, B, C...
 */
export function toDataset(matrix: string[][], headerRow = true): Dataset {
  const body = matrix.filter(r => r.some(c => String(c ?? '').trim() !== ''))
  if (!body.length) return { headers: [], rows: [] }
  const width = Math.max(...body.map(r => r.length))
  const rawHeaders = headerRow ? body[0] : []
  const dataRows = headerRow ? body.slice(1) : body

  const used = new Set<string>()
  const headers: string[] = []
  for (let i = 0; i < width; i++) {
    let h = String(rawHeaders[i] ?? '').trim() || (headerRow ? `Column ${columnName(i)}` : columnName(i))
    const base = h
    for (let n = 2; used.has(fieldKey(h)); n++) h = `${base} (${n})`
    used.add(fieldKey(h))
    headers.push(h)
  }
  const keep = headers.map((h, i) => !!String(rawHeaders[i] ?? '').trim() || !headerRow || dataRows.some(r => String(r[i] ?? '').trim()))
  const finalHeaders = headers.filter((_, i) => keep[i])
  const rows = dataRows.map(r => {
    const row: Row = {}
    headers.forEach((h, i) => {
      if (keep[i]) row[h] = String(r[i] ?? '').trim()
    })
    return row
  })
  return { headers: finalHeaders, rows }
}

const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:".]{2,}$/

/** Addresses in a cell, split on ; or , and stripped of "Name <addr>" wrappers. */
export function splitAddresses(s: string): string[] {
  return (s ?? '')
    .split(/[;,]/)
    .map(a => a.trim())
    .map(a => /<([^>]+)>/.exec(a)?.[1].trim() ?? a)
    .filter(Boolean)
}

export function isValidEmail(s: string): boolean {
  return EMAIL.test(s.trim())
}

/** The column that most looks like email addresses: by header name first, then by content. */
export function guessEmailColumn(ds: Dataset): string | null {
  const byName = ds.headers.find(h => /^(e-?mail|email address|e-mail address|mail)$/i.test(h.trim()))
    ?? ds.headers.find(h => /e-?mail/i.test(h))
  if (byName) return byName
  let best: string | null = null
  let bestCount = 0
  for (const h of ds.headers) {
    const n = ds.rows.slice(0, 200).filter(r => isValidEmail(r[h] ?? '')).length
    if (n > bestCount) {
      best = h
      bestCount = n
    }
  }
  return best
}

/** A row of Word's Filter Records tab. The first rule's `join` is ignored. */
export interface FilterRule {
  join: 'and' | 'or'
  field: string
  op: Op
  value: string
}

export function rulesToCondition(rules: FilterRule[]): Condition {
  const groups: Condition = []
  for (const r of rules) {
    if (!r.field) continue
    const c: Comparison = { field: r.field, op: r.op, value: r.value }
    if (!groups.length || r.join === 'or') groups.push([c])
    else groups[groups.length - 1].push(c)
  }
  return groups
}

export interface SortKey {
  field: string
  dir: 'asc' | 'desc'
}

/** Row indices that pass the filter, in sort order. Ties keep data source order. */
export function arrange(rows: Row[], rules: FilterRule[], sorts: SortKey[]): number[] {
  const condition = rulesToCondition(rules)
  const idx = rows.map((_, i) => i).filter(i => evaluate(rows[i], condition))
  const keys = sorts.filter(s => s.field)
  if (!keys.length) return idx
  return idx.sort((a, b) => {
    for (const k of keys) {
      const c = (lookup(rows[a], k.field) ?? '').localeCompare(lookup(rows[b], k.field) ?? '', undefined, {
        numeric: true,
        sensitivity: 'base',
      })
      if (c) return k.dir === 'asc' ? c : -c
    }
    return a - b
  })
}

/** Row indices whose address in `column` already appeared on an earlier row. */
export function duplicateRows(rows: Row[], column: string): Set<number> {
  const seen = new Set<string>()
  const dupes = new Set<number>()
  rows.forEach((r, i) => {
    const key = splitAddresses(lookup(r, column) ?? '').map(a => a.toLowerCase()).sort().join(';')
    if (!key) return
    if (seen.has(key)) dupes.add(i)
    else seen.add(key)
  })
  return dupes
}
