'use client'

import { forwardRef, memo, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { BodyFormat } from '../core'
import { Button, Label, inputClass } from './kit'
import { htmlLooksEmpty, linkHtml, plainToEditorHtml, sanitizeEmailHtml } from './richText'

export type RichBodyHandle = { insert: (text: string) => void }

const COMMANDS: { cmd: string; label: string; className: string }[] = [
  { cmd: 'bold', label: 'Bold', className: 'font-bold' },
  { cmd: 'italic', label: 'Italic', className: 'italic' },
  { cmd: 'underline', label: 'Underline', className: 'underline' },
  { cmd: 'strikeThrough', label: 'Strikethrough', className: 'line-through' },
]

type Sink = {
  el: HTMLDivElement | null
  commit: () => void
  focus: () => void
  paste: (e: React.ClipboardEvent) => void
  marks: () => void
}

/**
 * The editable node is memoized with a stable prop so a keystroke does not
 * make React wipe the text. The toolbar lives outside it and can re-render.
 *
 * ponytail: execCommand. Ceiling is tables, images, and font colors. Upgrade path is a real editor.
 */
const Surface = memo(function Surface({ sink }: { sink: React.MutableRefObject<Sink> }) {
  return (
    <div
      ref={node => { sink.current.el = node }}
      role="textbox"
      aria-label="Message"
      aria-multiline="true"
      contentEditable
      spellCheck
      suppressContentEditableWarning
      onFocus={() => sink.current.focus()}
      onMouseUp={() => sink.current.marks()}
      onKeyUp={() => sink.current.marks()}
      onInput={() => sink.current.commit()}
      onPaste={e => sink.current.paste(e)}
      className="block w-full px-5 py-4 text-[15px] leading-relaxed text-navy focus:outline-none min-h-[320px] [&_a]:text-orange-700 [&_a]:underline [&_u]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
    />
  )
})

export const RichBody = forwardRef<RichBodyHandle, {
  value: string
  format: BodyFormat
  onChange: (body: string, format: BodyFormat) => void
  onFocus?: () => void
}>(function RichBody({ value, format, onChange, onFocus }, handle) {
  const sink = useRef<Sink>({
    el: null,
    commit: () => {},
    focus: () => {},
    paste: () => {},
    marks: () => {},
  })
  const shown = useRef<string | null>(null)
  const [marks, setMarks] = useState<Record<string, boolean>>({})
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkText, setLinkText] = useState('')
  const [linkHref, setLinkHref] = useState('')
  const [linkError, setLinkError] = useState('')
  const savedRange = useRef<Range | null>(null)
  const onChangeRef = useRef(onChange)
  const onFocusRef = useRef(onFocus)
  onChangeRef.current = onChange
  onFocusRef.current = onFocus

  function readMarks() {
    const next: Record<string, boolean> = {}
    for (const c of COMMANDS) {
      try { next[c.cmd] = document.queryCommandState(c.cmd) } catch { next[c.cmd] = false }
    }
    setMarks(next)
  }

  function commit() {
    const el = sink.current.el
    if (!el) return
    const clean = sanitizeEmailHtml(el.innerHTML)
    const body = htmlLooksEmpty(clean) ? '' : clean
    if (clean !== el.innerHTML) el.innerHTML = body
    shown.current = body
    onChangeRef.current(body, body ? 'html' : 'text')
    readMarks()
  }

  sink.current.commit = commit
  sink.current.focus = () => { onFocusRef.current?.(); readMarks() }
  sink.current.marks = readMarks
  sink.current.paste = onPaste

  useEffect(() => {
    const el = sink.current.el
    if (!el || document.activeElement === el) return
    if (shown.current === value) return
    el.innerHTML = format === 'html' ? sanitizeEmailHtml(value) : plainToEditorHtml(value)
    shown.current = value
  }, [value, format])

  /** Keep a merge token whole. Bold inside {{First Name}} would break the field. */
  function protectMergeField() {
    const sel = document.getSelection()
    const el = sink.current.el
    if (!sel || !el || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    if (!el.contains(range.commonAncestorContainer)) return
    if (range.startContainer !== range.endContainer || range.startContainer.nodeType !== Node.TEXT_NODE) return
    const node = range.startContainer
    const text = node.textContent ?? ''
    const re = /\{\{[^}]*\}\}/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      const a = m.index
      const b = a + m[0].length
      const start = range.startOffset
      const end = range.endOffset
      const inside = start === end && start > a && start < b
      const partial = start < b && end > a && (start > a || end < b)
      if (!inside && !partial) continue
      if (inside) {
        range.setStart(node, b)
        range.collapse(true)
      } else {
        range.setStart(node, a)
        range.setEnd(node, b)
      }
      sel.removeAllRanges()
      sel.addRange(range)
      return
    }
  }

  function apply(cmd: string, arg?: string) {
    const el = sink.current.el
    if (!el) return
    el.focus()
    protectMergeField()
    try { document.execCommand('styleWithCSS', false, 'false') } catch { /* older browsers omit it */ }
    document.execCommand(cmd, false, arg)
    commit()
  }

  function openLink() {
    const el = sink.current.el
    const sel = document.getSelection()
    const inside = !!el && !!sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)
    savedRange.current = inside && sel ? sel.getRangeAt(0).cloneRange() : null
    setLinkText(inside && sel ? sel.toString() : '')
    setLinkHref('')
    setLinkError('')
    setLinkOpen(true)
  }

  function placeCaret() {
    const el = sink.current.el
    if (!el) return
    el.focus()
    const sel = document.getSelection()
    if (!sel) return
    sel.removeAllRanges()
    const range = savedRange.current
    if (range && el.contains(range.commonAncestorContainer)) sel.addRange(range)
    else {
      const end = document.createRange()
      end.selectNodeContents(el)
      end.collapse(false)
      sel.addRange(end)
    }
  }

  function addLink() {
    const html = linkHtml(linkText, linkHref)
    if (!html) {
      setLinkError('Use a web address or an email, such as charantra.ai or hr@charantra.ai')
      return
    }
    placeCaret()
    document.execCommand('insertHTML', false, html)
    commit()
    setLinkOpen(false)
  }

  function onPaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const html = e.clipboardData.getData('text/html')
    const text = e.clipboardData.getData('text/plain')
    const raw = html ? tagsFromStyles(html) : plainToEditorHtml(text)
    document.execCommand('insertHTML', false, sanitizeEmailHtml(raw))
    commit()
  }

  useImperativeHandle(handle, () => ({
    insert(text: string) {
      const el = sink.current.el
      if (!el) return
      el.focus()
      const sel = document.getSelection()
      const inside = !!sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)
      if (!inside && sel) {
        const range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(false)
        sel.removeAllRanges()
        sel.addRange(range)
      }
      document.execCommand('insertText', false, text)
      commit()
    },
  }))

  const empty = htmlLooksEmpty(format === 'html' ? value : plainToEditorHtml(value))

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1 px-3 py-1.5 border-b border-line bg-canvas/60" role="toolbar" aria-label="Formatting">
        {COMMANDS.map(c => (
          <button
            key={c.cmd}
            type="button"
            aria-pressed={!!marks[c.cmd]}
            onMouseDown={e => e.preventDefault()}
            onClick={() => apply(c.cmd)}
            className={`h-8 px-2.5 rounded-md text-[13px] text-navy hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange ${c.className} ${marks[c.cmd] ? 'bg-orange-50 ring-1 ring-orange/40' : ''}`}
          >
            {c.label}
          </button>
        ))}
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => apply('insertUnorderedList')} className="h-8 px-2.5 rounded-md text-[13px] text-navy hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange">Bullets</button>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => apply('insertOrderedList')} className="h-8 px-2.5 rounded-md text-[13px] text-navy hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange">Numbers</button>
        <button type="button" aria-expanded={linkOpen} onMouseDown={e => e.preventDefault()} onClick={() => linkOpen ? setLinkOpen(false) : openLink()} className={`h-8 px-2.5 rounded-md text-[13px] font-semibold text-navy underline hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange ${linkOpen ? 'bg-orange-50 ring-1 ring-orange/40' : ''}`}>Link</button>
      </div>
      {linkOpen && (
        <form
          className="grid gap-3 border-b border-line bg-orange-50/40 px-4 py-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={e => { e.preventDefault(); addLink() }}
        >
          <label className="block">
            <Label>Text</Label>
            <input className={inputClass} value={linkText} onChange={e => setLinkText(e.target.value)} placeholder="Book a call" autoFocus />
          </label>
          <label className="block">
            <Label>Address</Label>
            <input className={inputClass} value={linkHref} onChange={e => { setLinkHref(e.target.value); setLinkError('') }} placeholder="https://charantra.ai" />
          </label>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" size="sm">Add link</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setLinkOpen(false)}>Cancel</Button>
          </div>
          {linkError && <p className="sm:col-span-3 text-xs text-red-700">{linkError}</p>}
        </form>
      )}
      <div className="relative">
        {empty && (
          <p className="pointer-events-none absolute left-5 top-4 text-[15px] leading-relaxed text-navy/30">
            Dear {'{{First Name}}'}, then the message. Use the buttons above for bold, underline, and links.
          </p>
        )}
        <Surface sink={sink} />
      </div>
    </div>
  )
})

/** Word and Outlook paste bold as a styled span. Turn those into real tags before the allowlist. */
function tagsFromStyles(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('span, font').forEach(el => {
    const style = el.getAttribute('style') || ''
    const wraps: string[] = []
    if (/font-weight\s*:\s*(bold|[6-9]00)/i.test(style)) wraps.push('b')
    if (/font-style\s*:\s*italic/i.test(style)) wraps.push('em')
    if (/text-decoration\s*:[^;"]*underline/i.test(style)) wraps.push('u')
    const parent = el.parentNode
    if (!parent) return
    const frag = document.createDocumentFragment()
    while (el.firstChild) frag.appendChild(el.firstChild)
    let node: Node = frag
    for (const tag of wraps) {
      const w = document.createElement(tag)
      w.appendChild(node)
      node = w
    }
    parent.insertBefore(node, el)
    el.remove()
  })
  return doc.body.innerHTML
}
