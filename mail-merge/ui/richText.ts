/**
 * Markup the writer applies (bold, links) is stored as HTML.
 * Merged cell values are escaped later, in render(), so a spreadsheet cell cannot inject tags.
 *
 * ponytail: regex allowlist, not a DOM parser. Ceiling is a crafted tag the pattern misses.
 * Upgrade path is DOMParser on the same allowlist if a pasted payload gets through.
 */

const ALLOW = new Set(['a', 'b', 'br', 'div', 'em', 'i', 'li', 'ol', 'p', 's', 'strike', 'strong', 'u', 'ul'])

export function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Show a saved plain-text draft in the editor without turning it into HTML until they edit. */
export function plainToEditorHtml(text: string): string {
  return escapeText(text).replace(/\r\n/g, '\n').replace(/\n/g, '<br>')
}

export function htmlLooksEmpty(html: string): boolean {
  return html
    .replace(/<br\s*\/?>/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .trim() === ''
}

/** http(s) and mailto only. javascript: and data: are dropped. */
export function safeHref(raw: string): string | null {
  const t = decodeAttr(raw).replace(/[\u0000-\u001F\s]+/g, '')
  if (/^(https?:\/\/|mailto:)/i.test(t)) return t
  return null
}

/** Words plus an address. A bare host gets https://. javascript: is rejected. */
export function linkHtml(text: string, href: string): string | null {
  const safe = hrefFromPrompt(href)
  if (!safe) return null
  const label = text.trim() || safe
  return `<a href="${escapeAttr(safe)}">${escapeText(label)}</a>`
}

/** What the link button accepts. A bare host gets https://. javascript: still fails. */
export function hrefFromPrompt(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  const direct = safeHref(t)
  if (direct) return direct
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return safeHref(`mailto:${t}`)
  if (/^[a-z0-9.-]+\.[a-z]{2,}([/?#].*)?$/i.test(t)) return safeHref(`https://${t}`)
  return null
}

export function sanitizeEmailHtml(html: string): string {
  let s = html.replace(/<(script|style|iframe|object|embed|svg|math|form)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  s = s.replace(/<!--[\s\S]*?-->/g, '')
  s = s.replace(/<\/?[a-zA-Z0-9]+:[^>]*>/g, '')
  s = s.replace(/<\/?\s*([a-zA-Z0-9]+)([^>]*)>/g, (full, tag: string, attrs: string) => {
    const t = tag.toLowerCase()
    if (!ALLOW.has(t)) return ''
    if (t === 'br') return '<br>'
    if (full.trim().startsWith('</')) return `</${t}>`
    if (t === 'a') {
      const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i.exec(attrs)
      const raw = href?.[1] ?? href?.[2] ?? href?.[3] ?? ''
      const safe = safeHref(raw)
      return safe ? `<a href="${escapeAttr(safe)}">` : '<a>'
    }
    return `<${t}>`
  })
  return s
}

function decodeAttr(s: string): string {
  return s
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}
