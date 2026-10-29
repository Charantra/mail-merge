/**
 * The merge template language, modelled on Word's merge fields and rules.
 *
 *   {{First Name}}                         merge field (case, spaces and underscores ignored)
 *   {{First Name | default:"there"}}       formatting, applied left to right
 *   {{#if Sector = "Fintech"}}..{{else if Stage contains Seed}}..{{else}}..{{/if}}   If...Then...Else
 *   {{@record}}  {{@sequence}}  {{@date}}  Merge Record #, Merge Sequence #, today
 *   {{fill:Closing line}}                  Fill-in: asked once, the same for every record
 *
 * Pure: no DOM and no dependencies, so it runs in the browser, on a server and in checks.
 */
import { conditionFields, evaluate, parseCondition, type Condition } from './conditions'
import { lookup, type Row } from './fields'

interface FilterCall {
  name: string
  args: string[]
}

type Node =
  | { kind: 'text'; text: string }
  | { kind: 'field'; name: string; special?: 'record' | 'sequence' | 'date' | 'fill'; filters: FilterCall[] }
  | { kind: 'if'; branches: { condition: Condition | null; body: Node[] }[] }

export interface TemplateError {
  message: string
  at: number
}

export interface Template {
  nodes: Node[]
  errors: TemplateError[]
  /** Data source columns the template reads, in first-use order. */
  fields: string[]
  /** Fill-in prompts, in first-use order. */
  fills: string[]
}

export interface RenderContext {
  row: Row
  /** 1-based position of the row in the data source (Merge Record #). */
  record: number
  /** 1-based position among the records actually merged (Merge Sequence #). */
  sequence: number
  fills?: Record<string, string>
  now?: Date
  /** Applied to every merged value, never to template text. Pass an HTML escaper for HTML bodies. */
  escape?: (s: string) => string
}

export interface RenderResult {
  text: string
  /** Fields that came out blank and had no default. */
  blank: string[]
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DEFAULT_DATE = 'D MMMM YYYY'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** ISO dates, Excel serials, day-first d/m/y, and anything Date.parse accepts. */
export function parseDate(s: string): Date | null {
  const t = s.trim()
  if (!t) return null
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t)
  if (m) {
    const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3])
    return new Date(y, Number(m[2]) - 1, Number(m[1]))
  }
  if (/^\d{5}(\.\d+)?$/.test(t)) return new Date(Math.round((Number(t) - 25569) * 86400000) + new Date().getTimezoneOffset() * 60000)
  const ms = Date.parse(t)
  return Number.isNaN(ms) ? null : new Date(ms)
}

export function formatDate(d: Date, format: string): string {
  return format.replace(/dddd|ddd|YYYY|YY|MMMM|MMM|MM|M|DD|D/g, token => {
    switch (token) {
      case 'dddd': return DAYS[d.getDay()]
      case 'ddd': return DAYS[d.getDay()].slice(0, 3)
      case 'YYYY': return String(d.getFullYear())
      case 'YY': return String(d.getFullYear()).slice(-2)
      case 'MMMM': return MONTHS[d.getMonth()]
      case 'MMM': return MONTHS[d.getMonth()].slice(0, 3)
      case 'MM': return pad(d.getMonth() + 1)
      case 'M': return String(d.getMonth() + 1)
      case 'DD': return pad(d.getDate())
      default: return String(d.getDate())
    }
  })
}

function toNumber(s: string): number | null {
  const t = s.replace(/[^0-9.\-eE]/g, '')
  if (!t || !/\d/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** Formatting switches. Each takes the current text and returns the new text. */
export const FILTERS: Record<string, { help: string; apply: (v: string, args: string[]) => string }> = {
  default: { help: 'default:"text" when the field is blank', apply: (v, a) => (v.trim() === '' ? a[0] ?? '' : v) },
  upper: { help: 'UPPER CASE', apply: v => v.toUpperCase() },
  lower: { help: 'lower case', apply: v => v.toLowerCase() },
  title: { help: 'Title Case', apply: v => v.toLowerCase().replace(/(^|[\s\-(])(\S)/g, (_, p, c) => p + c.toUpperCase()) },
  capitalize: { help: 'First letter capital', apply: v => v.charAt(0).toUpperCase() + v.slice(1) },
  trim: { help: 'remove outer spaces', apply: v => v.trim() },
  first: { help: 'first word (first name from a full name)', apply: v => v.trim().split(/\s+/)[0] ?? '' },
  last: { help: 'last word (surname from a full name)', apply: v => v.trim().split(/\s+/).pop() ?? '' },
  truncate: { help: 'truncate:40 cuts to 40 characters', apply: (v, a) => {
    const n = Number(a[0] ?? 50)
    return v.length > n ? v.slice(0, n).trimEnd() + '...' : v
  } },
  replace: { help: 'replace:"old":"new"', apply: (v, a) => (a[0] ? v.split(a[0]).join(a[1] ?? '') : v) },
  number: { help: 'number:2 rounds with separators; number:0:en-IN for lakh grouping', apply: (v, a) => {
    const n = toNumber(v)
    if (n === null) return v
    const d = Number(a[0] ?? 0)
    return n.toLocaleString(a[1] || 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
  } },
  currency: { help: 'currency:USD or currency:INR', apply: (v, a) => {
    const n = toNumber(v)
    if (n === null) return v
    const code = (a[0] || 'USD').toUpperCase()
    const locale = a[1] || (code === 'INR' ? 'en-IN' : 'en-US')
    try {
      return n.toLocaleString(locale, { style: 'currency', currency: code, maximumFractionDigits: Number(a[2] ?? 0) })
    } catch {
      return v
    }
  } },
  date: { help: 'date:"DD MMM YYYY" (also dddd, MMMM, MM, YY, D)', apply: (v, a) => {
    const d = parseDate(v)
    return d ? formatDate(d, a[0] || DEFAULT_DATE) : v
  } },
}

/** Split on a separator character outside quotes. */
function splitTop(src: string, sep: string): string[] {
  const out: string[] = []
  let quote = ''
  let cur = ''
  for (const ch of src) {
    if (quote) {
      if (ch === quote) quote = ''
      cur += ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
      cur += ch
    } else if (ch === sep) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

function unquote(s: string): string {
  const t = s.trim()
  if (t.length >= 2 && (t[0] === '"' || t[0] === "'") && t[t.length - 1] === t[0]) return t.slice(1, -1)
  return t
}

const TAG = /\{\{([\s\S]*?)\}\}/g

export function parseTemplate(src: string): Template {
  const errors: TemplateError[] = []
  const fields: string[] = []
  const fills: string[] = []
  const root: Node[] = []
  const stack: { node: Extract<Node, { kind: 'if' }>; at: number }[] = []
  const seenField = new Set<string>()
  const addField = (name: string) => {
    const key = name.toLowerCase()
    if (!seenField.has(key)) {
      seenField.add(key)
      fields.push(name)
    }
  }
  const body = () => {
    const top = stack[stack.length - 1]
    return top ? top.node.branches[top.node.branches.length - 1].body : root
  }
  const text = (t: string) => {
    if (t) body().push({ kind: 'text', text: t })
  }

  let last = 0
  for (const m of Array.from(src.matchAll(TAG))) {
    const at = m.index ?? 0
    text(src.slice(last, at))
    last = at + m[0].length
    const inner = m[1].trim()

    const ifOpen = /^#if\s+([\s\S]+)$/i.exec(inner)
    const elseIf = /^(?:else\s*if|elseif)\s+([\s\S]+)$/i.exec(inner)
    if (ifOpen || elseIf) {
      const { condition, error } = parseCondition((ifOpen || elseIf)![1])
      if (error) errors.push({ message: error, at })
      for (const f of conditionFields(condition)) addField(f)
      if (ifOpen) {
        const node: Extract<Node, { kind: 'if' }> = { kind: 'if', branches: [{ condition, body: [] }] }
        body().push(node)
        stack.push({ node, at })
      } else if (!stack.length) errors.push({ message: '{{else if}} without a matching {{#if}}', at })
      else stack[stack.length - 1].node.branches.push({ condition, body: [] })
      continue
    }
    if (/^else$/i.test(inner)) {
      const top = stack[stack.length - 1]
      if (!top) errors.push({ message: '{{else}} without a matching {{#if}}', at })
      else if (top.node.branches.some(b => b.condition === null)) errors.push({ message: 'Second {{else}} in one {{#if}}', at })
      else top.node.branches.push({ condition: null, body: [] })
      continue
    }
    if (/^\/if$/i.test(inner)) {
      if (!stack.pop()) errors.push({ message: '{{/if}} without a matching {{#if}}', at })
      continue
    }
    if (inner === '') {
      errors.push({ message: 'Empty {{ }}', at })
      continue
    }

    const [head, ...rest] = splitTop(inner, '|')
    const filters: FilterCall[] = []
    for (const part of rest) {
      const [name, ...args] = splitTop(part.trim(), ':')
      const key = name.trim().toLowerCase()
      if (!FILTERS[key]) errors.push({ message: `Unknown format "${name.trim()}" in {{${inner}}}`, at })
      else filters.push({ name: key, args: args.map(unquote) })
    }
    const name = unquote(head)
    const fill = /^(?:fill|ask)\s*:\s*([\s\S]+)$/i.exec(name)
    if (fill) {
      const prompt = unquote(fill[1])
      if (!fills.includes(prompt)) fills.push(prompt)
      body().push({ kind: 'field', name: prompt, special: 'fill', filters })
    } else if (/^@(record|sequence|date)$/i.test(name)) {
      body().push({ kind: 'field', name, special: name.slice(1).toLowerCase() as 'record' | 'sequence' | 'date', filters })
    } else if (name.startsWith('@')) {
      errors.push({ message: `Unknown special field {{${name}}}. Use @record, @sequence or @date`, at })
    } else {
      addField(name.replace(/^\[(.*)\]$/, '$1'))
      body().push({ kind: 'field', name: name.replace(/^\[(.*)\]$/, '$1'), filters })
    }
  }
  const tail = src.slice(last)
  const open = tail.indexOf('{{')
  if (open >= 0) errors.push({ message: '"{{" is never closed with "}}"', at: last + open })
  text(tail)
  for (const s of stack) errors.push({ message: '{{#if}} is never closed with {{/if}}', at: s.at })

  return { nodes: root, errors, fields, fills }
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function render(template: Template, ctx: RenderContext): RenderResult {
  const blank: string[] = []
  const escape = ctx.escape ?? (s => s)
  const now = ctx.now ?? new Date()

  const walk = (nodes: Node[]): string => {
    let out = ''
    for (const n of nodes) {
      if (n.kind === 'text') out += n.text
      else if (n.kind === 'if') {
        const branch = n.branches.find(b => b.condition === null || evaluate(ctx.row, b.condition))
        if (branch) out += walk(branch.body)
      } else {
        let value: string
        if (n.special === 'record') value = String(ctx.record)
        else if (n.special === 'sequence') value = String(ctx.sequence)
        else if (n.special === 'date') value = toIsoDate(now)
        else if (n.special === 'fill') value = ctx.fills?.[n.name] ?? ''
        else value = lookup(ctx.row, n.name) ?? ''

        const hasDefault = n.filters.some(f => f.name === 'default')
        if (value.trim() === '' && !hasDefault && n.special !== 'fill') blank.push(n.name)
        for (const f of n.filters) value = FILTERS[f.name].apply(value, f.args)
        if (n.special === 'date' && !n.filters.some(f => f.name === 'date')) value = FILTERS.date.apply(value, [DEFAULT_DATE])
        out += escape(value)
      }
    }
    return out
  }

  return { text: walk(template.nodes), blank: Array.from(new Set(blank)) }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** Line and column of an error offset, for messages a person can act on. */
export function position(src: string, at: number): { line: number; column: number } {
  const before = src.slice(0, at).split('\n')
  return { line: before.length, column: before[before.length - 1].length + 1 }
}
