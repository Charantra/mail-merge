/**
 * Comparisons shared by template IF blocks and the recipient filter.
 * Word's operators plus the text ones its "Filter and Sort" dialog offers.
 */
import { lookup, type Row } from './fields'

export const OPERATORS = [
  { id: 'is_not_empty', label: 'is not blank', unary: true, syntax: ['is not empty', 'is not blank'] },
  { id: 'is_empty', label: 'is blank', unary: true, syntax: ['is empty', 'is blank'] },
  { id: 'not_contains', label: 'does not contain', unary: false, syntax: ['does not contain', 'not contains'] },
  { id: 'contains', label: 'contains', unary: false, syntax: ['contains'] },
  { id: 'starts_with', label: 'starts with', unary: false, syntax: ['starts with'] },
  { id: 'ends_with', label: 'ends with', unary: false, syntax: ['ends with'] },
  { id: 'gte', label: 'greater than or equal', unary: false, syntax: ['>='] },
  { id: 'lte', label: 'less than or equal', unary: false, syntax: ['<='] },
  { id: 'neq', label: 'not equal to', unary: false, syntax: ['!=', '<>'] },
  { id: 'eq', label: 'equal to', unary: false, syntax: ['==', '='] },
  { id: 'gt', label: 'greater than', unary: false, syntax: ['>'] },
  { id: 'lt', label: 'less than', unary: false, syntax: ['<'] },
] as const

export type Op = (typeof OPERATORS)[number]['id']

/** One test. A value written as [Column] compares against another column. */
export interface Comparison {
  field: string
  op: Op
  value: string
}

/** OR of AND groups: [[a, b], [c]] means (a and b) or c. */
export type Condition = Comparison[][]

export function isUnary(op: Op): boolean {
  return OPERATORS.find(o => o.id === op)?.unary ?? false
}

function toNumber(s: string): number | null {
  const t = s.replace(/[,\s]/g, '')
  if (t === '' || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return null
  return Number(t)
}

function wildcard(pattern: string): RegExp {
  const body = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp(`^${body}$`, 'i')
}

/** Numbers compare as numbers, everything else case-insensitively. `=` accepts * and ? wildcards. */
export function compare(left: string, op: Op, right: string): boolean {
  const a = (left ?? '').trim()
  const b = (right ?? '').trim()
  const al = a.toLowerCase()
  const bl = b.toLowerCase()
  const na = toNumber(a)
  const nb = toNumber(b)
  const both = na !== null && nb !== null
  const order = both ? na! - nb! : al.localeCompare(bl, undefined, { numeric: true })
  switch (op) {
    case 'is_empty':
      return a === ''
    case 'is_not_empty':
      return a !== ''
    case 'contains':
      return al.includes(bl)
    case 'not_contains':
      return !al.includes(bl)
    case 'starts_with':
      return al.startsWith(bl)
    case 'ends_with':
      return al.endsWith(bl)
    case 'eq':
      if (/[*?]/.test(b)) return wildcard(b).test(a)
      return both ? na === nb : al === bl
    case 'neq':
      if (/[*?]/.test(b)) return !wildcard(b).test(a)
      return both ? na !== nb : al !== bl
    case 'gt':
      return order > 0
    case 'gte':
      return order >= 0
    case 'lt':
      return order < 0
    case 'lte':
      return order <= 0
  }
}

function valueOf(row: Row, value: string): string {
  const ref = /^\[(.+)\]$/.exec(value.trim())
  return ref ? lookup(row, ref[1]) ?? '' : value
}

export function test(row: Row, c: Comparison): boolean {
  return compare(lookup(row, c.field) ?? '', c.op, valueOf(row, c.value))
}

export function evaluate(row: Row, condition: Condition): boolean {
  if (condition.length === 0) return true
  return condition.some(group => group.every(c => test(row, c)))
}

/** Split on a keyword that sits outside quotes and [brackets], with whitespace on both sides. */
function splitOutside(src: string, word: string): string[] {
  const parts: string[] = []
  const re = new RegExp(`^\\s+${word}\\s+`, 'i')
  let quote = ''
  let depth = 0
  let start = 0
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quote) {
      if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") quote = ch
    else if (ch === '[') depth++
    else if (ch === ']') depth = Math.max(0, depth - 1)
    else if (depth === 0 && /\s/.test(ch)) {
      const m = re.exec(src.slice(i))
      if (m) {
        parts.push(src.slice(start, i))
        start = i + m[0].length
        i = start - 1
      }
    }
  }
  parts.push(src.slice(start))
  return parts
}

function unquote(s: string): string {
  const t = s.trim()
  if (t.length >= 2 && (t[0] === '"' || t[0] === "'") && t[t.length - 1] === t[0]) return t.slice(1, -1)
  return t
}

/** First operator outside quotes and brackets; word operators need whitespace before them. */
function findOperator(src: string): { op: Op; at: number; len: number } | null {
  let quote = ''
  let depth = 0
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quote) {
      if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '[') depth++
    else if (ch === ']') depth = Math.max(0, depth - 1)
    if (depth > 0 || ch === ']') continue
    for (const o of OPERATORS) {
      for (const s of o.syntax) {
        if (/^[a-z]/i.test(s)) {
          if (!/\s/.test(ch)) continue
          const re = new RegExp(`^\\s+${s.replace(/ /g, '\\s+')}(\\s+|$)`, 'i')
          const m = re.exec(src.slice(i))
          if (m) return { op: o.id, at: i, len: m[0].length }
        } else if (src.startsWith(s, i)) {
          return { op: o.id, at: i, len: s.length }
        }
      }
    }
  }
  return null
}

/**
 * Parse `Sector = "Fintech" and Stage contains Seed or [Warm Intro] is not empty`.
 * A clause with no operator tests that the field is not blank.
 */
export function parseCondition(src: string): { condition: Condition; error?: string } {
  const condition: Condition = []
  for (const orPart of splitOutside(src, 'or')) {
    const group: Comparison[] = []
    for (const clause of splitOutside(orPart, 'and')) {
      const text = clause.trim()
      if (!text) return { condition, error: `Empty condition in "${src.trim()}"` }
      const found = findOperator(text)
      if (!found) {
        group.push({ field: unquote(text).replace(/^\[(.*)\]$/, '$1'), op: 'is_not_empty', value: '' })
        continue
      }
      const field = unquote(text.slice(0, found.at)).replace(/^\[(.*)\]$/, '$1')
      const raw = text.slice(found.at + found.len).trim()
      if (!field) return { condition, error: `Missing field name in "${text}"` }
      if (!isUnary(found.op) && raw === '') return { condition, error: `Missing value in "${text}"` }
      group.push({ field, op: found.op, value: /^\[.+\]$/.test(raw) ? raw : unquote(raw) })
    }
    condition.push(group)
  }
  return { condition }
}

/** Field names a condition reads, including [Column] values. */
export function conditionFields(condition: Condition): string[] {
  const out: string[] = []
  for (const group of condition)
    for (const c of group) {
      out.push(c.field)
      const ref = /^\[(.+)\]$/.exec(c.value.trim())
      if (ref) out.push(ref[1])
    }
  return out
}
