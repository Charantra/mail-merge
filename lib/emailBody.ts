/** Plain-text ↔ HTML for email compose (safe for client + server). */

const P_STYLE =
  'margin:0 0 16px 0;padding:0;line-height:1.65;color:#1e293b;font-size:15px;font-family:Georgia,Times New Roman,serif;'

const UL_STYLE =
  'margin:0 0 16px 0;padding:0 0 0 22px;line-height:1.65;color:#1e293b;font-size:15px;font-family:Georgia,Times New Roman,serif;list-style-type:disc;list-style-position:outside;'

const LI_STYLE = 'margin:0 0 8px 0;padding:0;'

function isBulletLine(line: string): boolean {
  const t = line.trim()
  return /^[-•*]\s+/.test(t) || /^\d+[.)]\s+/.test(t)
}

function bulletLineText(line: string): string {
  return line.trim().replace(/^[-•*]\s+/, '').replace(/^\d+[.)]\s+/, '').trim()
}

/** Replace em/en dashes and collapse awkward punctuation from model output. */
export function normalizeEmailPlain(body: string): string {
  return body
    .replace(/\bCharantra\s+Outreach\b/gi, 'Charantra')
    .replace(/\r\n/g, '\n')
    .replace(/\u2014/g, ', ')
    .replace(/\u2013/g, '-')
    .replace(/—/g, ', ')
    .replace(/–/g, '-')
    .replace(/,\s*,/g, ', ')
    .split('\n')
    .map(line => line.replace(/[ \t]{2,}/g, ' ').trimEnd())
    .join('\n')
    .trim()
}

const CHARANTRA_PIPE_RE = /(Charantra\s*\|\s*\S+@\S+)/i

function stripBoldMarkers(s: string): string {
  return s.replace(/\*\*/g, '').trim()
}

/** Stack signature as three lines; blank lines between so HTML preview keeps them separate. */
export function normalizeEmailClosing(body: string): string {
  const lines = body.replace(/\r\n/g, '\n').split('\n')
  const warmIdx = lines.findIndex(l => /\bwarm\s+regards\b/i.test(stripBoldMarkers(l)))
  if (warmIdx < 0) return body

  const before = lines.slice(0, warmIdx).join('\n').trimEnd()
  const afterWarm = lines.slice(warmIdx + 1)

  const closing: string[] = ['Warm regards,']

  for (const raw of afterWarm) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    const plain = stripBoldMarkers(trimmed)
    if (/^warm\s+regards/i.test(plain)) continue

    const merged = plain.match(/^(.+?)\s+(Charantra\s*\|\s*\S+@\S+)\s*$/i)
    if (merged) {
      const name = merged[1].trim()
      if (name && !/^charantra$/i.test(name)) closing.push(name)
      closing.push(merged[2].trim())
      continue
    }
    if (CHARANTRA_PIPE_RE.test(plain)) {
      closing.push(plain)
      continue
    }
    if (!/^charantra$/i.test(plain)) closing.push(plain)
  }

  const deduped = closing.filter((line, i) => i === 0 || line !== closing[i - 1])
  const signature = deduped.join('\n\n')
  if (!before) return signature
  return `${before}\n\n${signature}`
}

function isFundingOrClosingLine(line: string): boolean {
  const t = line.trim()
  if (!t) return true
  if (/^would you be open/i.test(t)) return true
  if (/^warm regards/i.test(t)) return true
  if (/^explore \[/i.test(t)) return true
  if (/^funding ask/i.test(t)) return true
  if (/\braising\b.*\b(round|seed|series|pre-?seed|valuation)\b/i.test(t)) return true
  if (/^we represent\b/i.test(t)) return true
  if (/^we are \*\*/i.test(t)) return true
  return false
}

/** Metric / traction line that should be a Key Highlights bullet. */
function isHighlightFactLine(line: string): boolean {
  const t = line.trim()
  if (!t || isBulletLine(t) || isFundingOrClosingLine(t)) return false
  if (t.length > 300) return false
  if (/^https?:\/\//i.test(t)) return false
  if (/^[A-Z][^:]{2,72}:\s/.test(t)) return true
  if (/\*\*(?:USD|INR|€|£|\$)[^*]+\*\*/i.test(t)) return true
  if (/\*\*\d[\d,.]*(?:\s*(?:K|M|B|Lakhs?))?\*\*/i.test(t)) return true
  if (/\d+(?:\.\d+)?%/.test(t) && t.length < 220) return true
  if (
    /^(?:Pipeline|Revenue|Signed|Validated|Patents|ARR|MRR|Customers|Clients|Contracts|Growth|GMV|Users|Partners)/i.test(
      t,
    )
  ) {
    return true
  }
  return false
}

/** When the model omits "- ", turn consecutive Key Highlights facts into bullets. */
export function ensureKeyHighlightsBullets(body: string): string {
  const lines = body.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let i = 0

  while (i < lines.length) {
    const trimmed = lines[i].trim()
    if (!trimmed) {
      if (out.length && out[out.length - 1] !== '') out.push('')
      i++
      continue
    }

    let j = i
    const run: string[] = []
    while (j < lines.length) {
      const t = lines[j].trim()
      if (!t) break
      if (isBulletLine(t)) break
      if (!isHighlightFactLine(t)) break
      run.push(t)
      j++
    }

    if (run.length >= 2) {
      for (const r of run) out.push(`- ${r}`)
      i = j
      continue
    }

    out.push(trimmed)
    i++
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Turn single line breaks between sentences into paragraph gaps when the model omits blank lines. */
export function ensureParagraphBreaks(body: string): string {
  const lines = body.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (!trimmed) {
      if (out.length && out[out.length - 1] !== '') out.push('')
      continue
    }
    out.push(trimmed)

    let j = i + 1
    while (j < lines.length && !lines[j].trim()) j++
    const next = j < lines.length ? lines[j].trim() : ''
    if (
      next &&
      !isBulletLine(trimmed) &&
      !isBulletLine(next) &&
      !isHighlightFactLine(trimmed) &&
      !isHighlightFactLine(next) &&
      (/[.!?:]$/.test(trimmed) || /^Warm regards,?$/i.test(stripBoldMarkers(trimmed))) &&
      /^[A-Z*"']/.test(next) &&
      !/^(Best regards|Regards|Sincerely|Thanks|Thank you)/i.test(next)
    ) {
      out.push('')
    }
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Remove deck / investor-memo teaser lines from drafts (teasers sent as attachments). */
export function stripDeckTeaserLines(body: string): string {
  return body
    .split('\n')
    .filter(line => {
      const t = line.trim()
      if (!t) return true
      if (/full investor memo/i.test(t) && /deck/i.test(t)) return false
      if (/investor memo\s*(?:and|\/)\s*deck/i.test(t) && /available/i.test(t)) return false
      if (/^Investor memo\s*\/\s*deck:/i.test(t)) return false
      if (/^https?:\/\/deck\.charantra\.ai\//i.test(t)) return false
      return true
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function stripDeckTeaserFromHtml(html: string): string {
  if (!html?.trim()) return html
  let h = html
  h = h.replace(
    /<p[^>]*>[^<]*(?:full investor memo|investor memo\s*(?:and|\/)\s*deck)[^<]*(?:available here|:)[^<]*<\/p>\s*/gi,
    '',
  )
  h = h.replace(
    /<p[^>]*>\s*<a[^>]*href="https?:\/\/deck\.charantra\.ai[^"]*"[^>]*>[^<]*<\/a>\s*<\/p>\s*/gi,
    '',
  )
  h = h.replace(
    /<p[^>]*>\s*https?:\/\/deck\.charantra\.ai\/\S+\s*<\/p>\s*/gi,
    '',
  )
  return h
}

export function postProcessEmailPlain(body: string): string {
  return ensureParagraphBreaks(
    ensureKeyHighlightsBullets(
      stripDeckTeaserLines(normalizeEmailClosing(normalizeEmailPlain(body))),
    ),
  )
}

const LINK_STYLE = 'color:#2563eb;text-decoration:underline;'

export function normalizeWebsiteUrl(raw?: string | null): string | null {
  if (!raw?.trim()) return null
  let u = raw.trim().replace(/[>),.;]+$/g, '')
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`
  try {
    const parsed = new URL(u)
    if (!parsed.hostname) return null
    return parsed.href.replace(/\/$/, '')
  } catch {
    return null
  }
}

/** Short names to try when Notion page title is long (e.g. "AstraOps AI - Investor Memo (Seed)"). */
export function companyNameVariants(name: string): string[] {
  const n = name.trim()
  if (!n) return []
  const variants = new Set<string>([n])
  const beforeDash = n.split(/\s[-–—|]\s/)[0]?.trim()
  if (beforeDash) variants.add(beforeDash)
  const beforeParen = n.split(/\s*\(/)[0]?.trim()
  if (beforeParen) variants.add(beforeParen)
  const firstWord = n.split(/\s+/)[0]
  if (firstWord && firstWord.length >= 3) variants.add(firstWord)
  return Array.from(variants).sort((a, b) => b.length - a.length)
}

function companySlugTokens(name?: string): string[] {
  if (!name?.trim()) return []
  const tokens = new Set<string>()
  for (const variant of companyNameVariants(name)) {
    const primary = variant.split(/\s*\(/)[0]?.trim() || variant
    const words = primary.split(/\s+/).filter(Boolean)
    if (words[0]) {
      const w = words[0].toLowerCase().replace(/[^a-z0-9]/g, '')
      if (w.length >= 4) tokens.add(w)
    }
    if (words.length >= 2) {
      const w2 = words.slice(0, 2).join('').toLowerCase().replace(/[^a-z0-9]/g, '')
      if (w2.length >= 4) tokens.add(w2)
    }
    const full = variant.toLowerCase().replace(/[^a-z0-9]+/g, '')
    if (full.length >= 4) tokens.add(full)
  }
  return Array.from(tokens)
}
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Pull website from Notion fields or CIM body text. */
export function resolveCompanyWebsite(
  ctx?: {
    website?: string
    raw_content?: string
    name?: string
    one_liner?: string
    description?: string
  } | null,
): string | null {
  const fromField = normalizeWebsiteUrl(ctx?.website)
  if (fromField) return fromField

  const raw = [ctx?.raw_content, ctx?.one_liner, ctx?.description]
    .filter(Boolean)
    .join('\n')

  const labeled = raw.match(
    /(?:website|homepage|web\s*site|company\s*url|url|site)[:\s]+(https?:\/\/\S+|www\.\S+)/i,
  )
  if (labeled?.[1]) return normalizeWebsiteUrl(labeled[1])

  const labeledBare = raw.match(
    /(?:website|homepage|web\s*site|company\s*url|url|site)[:\s]+([a-z0-9][-a-z0-9.]*\.(?:ai|com|io|co|in|net|org))\b/i,
  )
  if (labeledBare?.[1]) return normalizeWebsiteUrl(labeledBare[1])

  const name = ctx?.name?.trim()
  if (name && raw) {
    for (const slug of companySlugTokens(name)) {
      const slugEsc = escapeRegex(slug)
      const slugDomain = raw.match(
        new RegExp(
          `\\b(?:https?://(?:www\\.)?|www\\.)?${slugEsc}[a-z0-9.-]*\\.(?:ai|com|io|co|in|net|org)\\b`,
          'i',
        ),
      )
      if (slugDomain?.[0]) return normalizeWebsiteUrl(slugDomain[0])
    }
  }

  const bare = raw.match(
    /\b(https?:\/\/(?:www\.)?[a-z0-9][-a-z0-9.]+\.(?:ai|com|io|co|in|net|org)(?:\/[^\s)]*)?)/i,
  )
  if (bare?.[1]) return normalizeWebsiteUrl(bare[1])

  const www = raw.match(
    /\b(www\.[a-z0-9][-a-z0-9.]+\.(?:ai|com|io|co|in|net|org)(?:\/[^\s)]*)?)/i,
  )
  if (www?.[1]) return normalizeWebsiteUrl(www[1])

  return null
}

/** True when the draft already has a portfolio-company markdown link from Claude. */
function bodyHasNonCharantraMarkdownLink(body: string): boolean {
  const re = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    if (!urlsEquivalent(m[2], CHARANTRA_SITE)) return true
  }
  return false
}

function firstNonCharantraLinkUrl(body: string): string | null {
  const re = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    if (!urlsEquivalent(m[2], CHARANTRA_SITE)) {
      return normalizeWebsiteUrl(m[2])
    }
  }
  return null
}

/** Bare company URL in draft text — only used when Claude omitted the markdown link. */
function extractBareCompanyUrlFromBody(body: string, companyName: string): string | null {
  if (!companyName?.trim() || !body?.trim()) return null
  for (const slug of companySlugTokens(companyName)) {
    const slugEsc = escapeRegex(slug)
    const re = new RegExp(
      `\\b(https?://(?:www\\.)?${slugEsc}[a-z0-9.-]*\\.(?:ai|com|io|co|in|net|org)(?:/[^\\s)]*)?)`,
      'i',
    )
    const m = body.match(re)
    if (m?.[1]) return normalizeWebsiteUrl(m[1])
  }
  return null
}

const CHARANTRA_SITE = 'https://charantra.ai'

function urlsEquivalent(a: string, b: string): boolean {
  const na = normalizeWebsiteUrl(a)
  const nb = normalizeWebsiteUrl(b)
  if (na && nb) return na === nb
  return a.replace(/\/$/, '').toLowerCase() === b.replace(/\/$/, '').toLowerCase()
}

function bodyHasMarkdownLinkForUrl(body: string, url: string): boolean {
  const re = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    if (urlsEquivalent(m[2], url)) return true
  }
  return false
}

function protectMarkdownLinks(body: string): { text: string; links: string[] } {
  const links: string[] = []
  const text = body.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi, (m) => {
    const i = links.length
    links.push(m)
    return `\x00MDLINK${i}\x00`
  })
  return { text, links }
}

function restoreMarkdownLinks(text: string, links: string[]): string {
  return text.replace(/\x00MDLINK(\d+)\x00/g, (_, i) => links[Number(i)] ?? '')
}

/** Fix broken / duplicated link syntax from model output or double-processing. */
function repairBrokenLinkSyntax(body: string): string {
  const { text, links } = protectMarkdownLinks(body)
  let out = text

  // Name(url) without markdown — e.g. Charantra(https://charantra.ai/)
  out = out.replace(
    /(?<!\[)\b([A-Za-z][\w.-]+)\((https?:\/\/[^)\s]+)\)/g,
    '[$1]($2)',
  )

  out = restoreMarkdownLinks(out, links)

  // [Name](url)](url) or [Name](url)(url) — duplicate suffixes
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\s*\]\s*\((https?:\/\/[^)\s]+)\)/gi,
    '[$1]($2)',
  )
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\s*\((https?:\/\/[^)\s]+)\)/gi,
    (m, label, u1, u2) =>
      urlsEquivalent(u1, u2) ? `[${label}](${u1})` : m,
  )

  // Charantra(url)](url) — missing opening bracket before a valid suffix
  out = out.replace(
    /\b([A-Za-z][\w.-]+)\((https?:\/\/[^)\s]+)\)\]\((https?:\/\/[^)\s]+)\)/gi,
    '[$1]($2)',
  )

  return out
}

/** Remove "Website:", "Explore", "Representing" lines and bare URL-only lines. */
function stripExtraneousUrlLines(body: string): string {
  return body
    .split('\n')
    .filter(line => {
      const t = line.trim()
      if (/^Website:\s*/i.test(t)) return false
      if (/^Explore \[/i.test(t)) return false
      if (/^Representing:/i.test(t)) return false
      if (/^https?:\/\/\S+\s*$/i.test(t)) return false
      return true
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Keep only the first markdown link for a given URL; unwrap duplicates to plain text. */
function dedupeMarkdownLinks(body: string, url: string): string {
  const u = normalizeWebsiteUrl(url)
  if (!u) return body
  let seen = false
  return body.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi,
    (match, label, href) => {
      if (!urlsEquivalent(href, u)) return match
      if (!seen) {
        seen = true
        return `[${label}](${u})`
      }
      return label
    },
  )
}

/** Hyperlink the first mention of a name inline — exactly once per URL in the draft. */
export function linkNameOnce(body: string, name: string, url: string): string {
  const n = name.trim()
  const u = normalizeWebsiteUrl(url)
  if (!n || !u || !body?.trim()) return body

  if (bodyHasMarkdownLinkForUrl(body, u)) return body

  const nameEsc = escapeRegex(n)
  if (new RegExp(`\\[${nameEsc}[^\\]]*\\]\\(`, 'i').test(body)) return body

  // **AstraOps AI - Investor Memo (Seed)** — link name at start of a longer bold span
  const boldStartsRe = new RegExp(`\\*\\*(${nameEsc})((?:\\s+[^*]+)*?)\\*\\*`, 'i')
  const boldStartsMatch = body.match(boldStartsRe)
  if (boldStartsMatch && boldStartsMatch.index != null) {
    return (
      body.slice(0, boldStartsMatch.index) +
      `[${boldStartsMatch[1]}](${u})${boldStartsMatch[2]}` +
      body.slice(boldStartsMatch.index + boldStartsMatch[0].length)
    )
  }

  const boldRe = new RegExp(`\\*\\*(${nameEsc})\\*\\*`, 'i')
  const boldMatch = body.match(boldRe)
  if (boldMatch && boldMatch.index != null) {
    return (
      body.slice(0, boldMatch.index) +
      `[${boldMatch[1]}](${u})` +
      body.slice(boldMatch.index + boldMatch[0].length)
    )
  }

  const wordRe = new RegExp(`(?<!\\[)\\b(${nameEsc})\\b(?!\\])`, 'i')
  const wordMatch = body.match(wordRe)
  if (wordMatch && wordMatch.index != null) {
    const label = wordMatch[1]
    return (
      body.slice(0, wordMatch.index) +
      `[${label}](${u})` +
      body.slice(wordMatch.index + label.length)
    )
  }

  return body
}

/** Link portfolio company — tries short name variants when Notion title is long. */
function linkCompanyOnce(body: string, companyName: string, url: string): string {
  const u = normalizeWebsiteUrl(url)
  if (!companyName?.trim() || !u) return body
  if (bodyHasMarkdownLinkForUrl(body, u)) return body

  for (const variant of companyNameVariants(companyName)) {
    const updated = linkNameOnce(body, variant, u)
    if (updated !== body) return updated
  }
  return body
}

function applyInlineUrlLinks(
  body: string,
  opts?: { companyName?: string; website?: string | null; charantraName?: string },
): string {
  let out = stripExtraneousUrlLines(body)
  out = repairBrokenLinkSyntax(out)
  const brand = opts?.charantraName?.trim() || 'Charantra'

  out = linkNameOnce(out, brand, CHARANTRA_SITE)
  out = dedupeMarkdownLinks(out, CHARANTRA_SITE)

  // Preserve Claude's company link — do not inject from Notion or guess from name.
  if (bodyHasNonCharantraMarkdownLink(out)) {
    const companyUrl = firstNonCharantraLinkUrl(out)
    if (companyUrl) out = dedupeMarkdownLinks(out, companyUrl)
  } else if (opts?.companyName) {
    const bareUrl = extractBareCompanyUrlFromBody(out, opts.companyName)
    if (bareUrl) {
      out = linkCompanyOnce(out, opts.companyName, bareUrl)
      out = dedupeMarkdownLinks(out, bareUrl)
    }
  }

  return repairBrokenLinkSyntax(out)
}

export function finalizeEmailBody(
  body: string,
  opts?: { companyName?: string; website?: string | null; charantraName?: string },
): string {
  const out = postProcessEmailPlain(body)
  return applyInlineUrlLinks(out, opts)
}

export function wrapEmailHtml(inner: string): string {
  return `<div style="max-width:640px;margin:0 auto;">${inner}</div>`
}

function plainLinesToHtml(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const chunks: { type: 'p' | 'ul'; lines: string[] }[] = []
  let current: { type: 'p' | 'ul'; lines: string[] } = { type: 'p', lines: [] }

  const flush = () => {
    if (!current.lines.length) return
    chunks.push(current)
    current = { type: 'p', lines: [] }
  }

  for (const raw of lines) {
    const trimmed = raw.trim()
    if (!trimmed) {
      flush()
      continue
    }
    if (isBulletLine(trimmed)) {
      if (current.type !== 'ul') {
        flush()
        current = { type: 'ul', lines: [] }
      }
      current.lines.push(bulletLineText(trimmed))
      continue
    }
    if (current.type === 'ul') flush()
    current.type = 'p'
    current.lines.push(trimmed)
  }
  flush()

  if (!chunks.length) return `<p style="${P_STYLE}"></p>`

  return chunks
    .map(chunk => {
      if (chunk.type === 'ul') {
        const items = chunk.lines
          .map(li => `<li style="${LI_STYLE}">${formatInlineHtml(li)}</li>`)
          .join('')
        return `<ul style="${UL_STYLE}">${items}</ul>`
      }
      return `<p style="${P_STYLE}">${formatInlineHtml(chunk.lines.join(' '))}</p>`
    })
    .join('\n')
}

export function plainToHtml(body: string): string {
  const text = postProcessEmailPlain(body)
  if (!text) return `<p style="${P_STYLE}"></p>`
  if (/<\s*p[\s>]/i.test(text)) {
    const styled = ensureEmailParagraphStyles(text)
    const withLinks = convertMarkdownLinksInHtml(styled)
    return stripDeckTeaserFromHtml(withLinks)
  }
  return plainLinesToHtml(text)
}

function ensureEmailParagraphStyles(html: string): string {
  if (/margin:\s*0\s+0\s+16px/i.test(html)) return html
  return html.replace(/<p(\s[^>]*)?>/gi, match => {
    if (/style=/i.test(match)) return match
    return `<p style="${P_STYLE}">`
  })
}

function convertMarkdownLinksInHtml(html: string): string {
  // Handle cases where the model returned HTML but we still injected markdown links
  // (e.g., [Charantra](https://charantra.ai/)). Convert them into anchors.
  return html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi,
    (_m, label, href) => {
      const inner = String(label).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      const safeHref = String(href).replace(/&amp;/g, '&')
      return `<a href="${safeHref}" style="${LINK_STYLE}">${inner}</a>`
    },
  )
}

function formatInlineHtml(text: string): string {
  let s = escapeHtml(text)

  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi,
    (_m, label, href) => {
      const inner = String(label).replace(
        /\*\*([^*]+)\*\*/g,
        '<strong>$1</strong>',
      )
      const safeHref = href.replace(/&amp;/g, '&')
      return `<a href="${safeHref}" style="${LINK_STYLE}">${inner}</a>`
    },
  )

  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')

  s = s.replace(
    /(\$[\d,.]+(?:\s*[KMB])?(?:\s*(?:pre-?seed|seed|series\s+[a-c]|round|raise|valuation|pre-money))?)/gi,
    (m, _g, offset, whole) => {
      const before = whole.slice(Math.max(0, offset - 8), offset)
      if (before.includes('<strong>')) return m
      return `<strong>${m}</strong>`
    },
  )

  s = s.replace(
    /(\b\d[\d,]*(?:\.\d+)?%|\b\d[\d,]*\+?\s*(?:ARR|MRR|users|customers|partners|clients)\b)/gi,
    (m, _g, offset, whole) => {
      const before = whole.slice(Math.max(0, offset - 8), offset)
      if (before.includes('<strong>')) return m
      return `<strong>${m}</strong>`
    },
  )

  s = s.replace(
    /(https?:\/\/[^\s<>"']+)/gi,
    (m, _g, offset, whole) => {
      const before = whole.slice(Math.max(0, offset - 16), offset)
      if (
        /href="$/i.test(before) ||
        /href='$/i.test(before) ||
        /\]\($/i.test(before) ||
        /<a[^>]*>$/i.test(before)
      ) {
        return m
      }
      return `<a href="${m}" style="${LINK_STYLE}">${m}</a>`
    },
  )

  return s
}

export function htmlToPlain(html: string): string {
  if (!html?.trim()) return ''
  let t = html
  t = t.replace(/<br\s*\/?>/gi, '\n')
  t = t.replace(/<\/li>\s*<li[^>]*>/gi, '\n')
  t = t.replace(/<li[^>]*>/gi, '- ')
  t = t.replace(/<\/li>/gi, '\n')
  t = t.replace(/<\/?ul[^>]*>/gi, '\n')
  t = t.replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
  t = t.replace(/<\/p>/gi, '\n\n')
  t = t.replace(/<p[^>]*>/gi, '')
  t = t.replace(/<\/strong>/gi, '**')
  t = t.replace(/<strong[^>]*>/gi, '**')
  t = t.replace(/<a[^>]+href="([^"]*)"[^>]*>[^<]*<\/a>/gi, '$1')
  t = t.replace(/<[^>]+>/g, '')
  t = t
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
  return postProcessEmailPlain(t.replace(/\n{3,}/g, '\n\n').trim())
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
