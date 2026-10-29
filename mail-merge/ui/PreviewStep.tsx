'use client'

import { useEffect, useMemo, useState } from 'react'
import { buildEml, emlName, type MergedMessage, type Row } from '../core'
import type { MergeFile } from './ComposeStep'
import { Avatar, Badge, Button, Icon, Segmented, download, inputClass } from './kit'

export function filesFor(m: MergedMessage, files: MergeFile[]): MergeFile[] {
  const named = new Set(m.attachments.map(a => a.toLowerCase()))
  return files.filter(f => f.shared || named.has(f.name.toLowerCase()))
}

/** One merged email, drawn like a message open in a mail client. */
export function MessageView({ m, files, from }: { m: MergedMessage; files: MergeFile[]; from?: string }) {
  const attached = filesFor(m, files)
  return (
    <article className="bg-white border border-line rounded-2xl shadow-card overflow-hidden">
      <header className="px-6 pt-5 pb-4 border-b border-line">
        <h2 className="text-xl font-bold text-navy tracking-tight leading-snug">
          {m.subject || <span className="text-red-600 font-semibold">(blank subject)</span>}
        </h2>
        <div className="flex items-start gap-3 mt-4">
          <Avatar text={from || 'You'} size={38} />
          <dl className="flex-1 min-w-0 grid grid-cols-[40px_1fr] gap-x-2 gap-y-0.5 text-[13px]">
            <dt className="text-navy/45">From</dt>
            <dd className="font-semibold text-navy truncate">{from || 'Your Outlook mailbox'}</dd>
            <dt className="text-navy/45">To</dt>
            <dd className="text-navy/80 break-all">{m.to.join(', ') || <span className="text-red-600">(none)</span>}</dd>
            {m.cc.length > 0 && (
              <>
                <dt className="text-navy/45">CC</dt>
                <dd className="text-navy/80 break-all">{m.cc.join(', ')}</dd>
              </>
            )}
            {m.bcc.length > 0 && (
              <>
                <dt className="text-navy/45">BCC</dt>
                <dd className="text-navy/80 break-all">{m.bcc.join(', ')}</dd>
              </>
            )}
          </dl>
        </div>
        {attached.length > 0 && (
          <ul className="flex flex-wrap gap-2 mt-4">
            {attached.map(f => (
              <li key={f.name} className="inline-flex items-center gap-2 rounded-lg border border-line bg-canvas/60 pl-2 pr-3 py-1.5 text-xs">
                <Icon name="paperclip" size={13} className="text-navy/45" />
                <span className="font-semibold text-navy">{f.name}</span>
                <span className="text-navy/40">{(f.bytes.length / 1024).toFixed(0)} KB</span>
              </li>
            ))}
          </ul>
        )}
      </header>
      {m.format === 'html' ? (
        // Sandboxed with no permissions: scripts, forms and navigation in the template cannot run.
        <iframe title="Merged message" sandbox="" srcDoc={m.body} className="w-full h-[460px] bg-white" />
      ) : (
        <div className="px-6 py-5 whitespace-pre-wrap text-[15px] leading-relaxed text-navy/90 min-h-[280px]">{m.body}</div>
      )}
    </article>
  )
}

function statusOf(x: MergedMessage): { tone: 'green' | 'amber' | 'red'; label: string } {
  if (x.skipped) return { tone: 'amber', label: 'Skipped' }
  if (x.issues.some(i => i.level === 'error')) return { tone: 'red', label: 'Error' }
  if (x.issues.length) return { tone: 'amber', label: 'Warning' }
  return { tone: 'green', label: 'Ready' }
}

export function PreviewStep({
  messages,
  rows,
  files,
  from,
  onExclude,
}: {
  messages: MergedMessage[]
  rows: Row[]
  files: MergeFile[]
  from: string
  onExclude: (index: number) => void
}) {
  const [at, setAt] = useState(0)
  const [find, setFind] = useState('')
  const [list, setList] = useState<'all' | 'issues'>('all')
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (at >= messages.length) setAt(Math.max(0, messages.length - 1))
  }, [messages.length, at])

  // Left and right arrows step through people, unless the cursor is in a box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select')) return
      if (e.key === 'ArrowRight') setAt(a => Math.min(a + 1, messages.length - 1))
      if (e.key === 'ArrowLeft') setAt(a => Math.max(a - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [messages.length])

  const problems = useMemo(() => messages.map((x, i) => ({ x, i })).filter(({ x }) => x.skipped || x.issues.length), [messages])
  const q = find.trim().toLowerCase()
  const listed = useMemo(() => {
    const base = list === 'issues' ? problems : messages.map((x, i) => ({ x, i }))
    return q ? base.filter(({ x }) => Object.values(rows[x.index] ?? {}).some(v => v.toLowerCase().includes(q))) : base
  }, [list, problems, messages, rows, q])

  if (!messages.length)
    return (
      <div className="bg-white border border-line rounded-2xl shadow-card px-6 py-14 text-center">
        <Icon name="users" size={28} className="mx-auto text-navy/25" />
        <p className="text-base font-bold text-navy mt-3">No one is ticked</p>
        <p className="text-sm text-navy/55 mt-1">Go back and tick the people who should get this email.</p>
      </div>
    )

  const m = messages[Math.min(at, messages.length - 1)]
  const st = statusOf(m)

  function copy() {
    void navigator.clipboard?.writeText(m.body)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)] items-start">
      <aside className="bg-white border border-line rounded-2xl shadow-card overflow-hidden xl:sticky xl:top-24 order-2 xl:order-1">
        <div className="p-3 border-b border-line space-y-2.5">
          <div className="relative">
            <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy/35 pointer-events-none" />
            <input className={`${inputClass} pl-8 py-1.5`} placeholder="Find a recipient" value={find} onChange={e => setFind(e.target.value)} />
          </div>
          <Segmented
            size="sm"
            value={list}
            onChange={setList}
            options={[
              { value: 'all', label: 'Everyone', count: messages.length },
              { value: 'issues', label: 'Needs a look', count: problems.length },
            ]}
          />
        </div>
        <ul className="max-h-[calc(100vh-22rem)] min-h-[200px] overflow-y-auto scroll-thin p-1.5">
          {listed.map(({ x, i }) => {
            const s = statusOf(x)
            const on = i === at
            return (
              <li key={x.index}>
                <button
                  type="button"
                  onClick={() => setAt(i)}
                  className={`w-full flex items-center gap-3 text-left px-2.5 py-2 rounded-xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange ${
                    on ? 'bg-orange-50 ring-1 ring-inset ring-orange-300/60' : 'hover:bg-canvas'
                  }`}
                >
                  <Avatar text={x.to[0] ?? '?'} size={32} />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-navy truncate">{x.to[0] ?? '(no address)'}</span>
                    </span>
                    <span className="block text-xs text-navy/50 truncate">
                      {x.skipped ?? (x.issues.map(p => p.message).join(' · ') || x.subject || '(blank subject)')}
                    </span>
                  </span>
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${s.tone === 'green' ? 'bg-emerald-500' : s.tone === 'red' ? 'bg-red-500' : 'bg-amber-400'}`}
                    title={s.label}
                  />
                </button>
              </li>
            )
          })}
          {!listed.length && (
            <li className="px-3 py-8 text-center text-sm text-navy/50">
              {list === 'issues' && !q ? (
                <span className="inline-flex flex-col items-center gap-2 text-emerald-700">
                  <Icon name="check-circle" size={22} />
                  No problems in {messages.length} records
                </span>
              ) : (
                'No one matches.'
              )}
            </li>
          )}
        </ul>
      </aside>

      <div className="space-y-3 min-w-0 order-1 xl:order-2">
        <div className="flex flex-wrap items-center gap-2 bg-white border border-line rounded-2xl shadow-card p-2">
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setAt(0)} disabled={at === 0} aria-label="First record">
              <Icon name="chevrons-left" size={15} />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAt(at - 1)} disabled={at === 0} aria-label="Previous record">
              <Icon name="chevron-left" size={15} />
            </Button>
            <span className="text-sm text-navy/60 px-1 tabular-nums">
              <input
                aria-label="Recipient number"
                className="w-12 h-8 text-center rounded-lg border border-line text-sm font-bold text-navy focus:outline-none focus:border-orange focus:shadow-glow"
                value={at + 1}
                onChange={e => {
                  const n = Number(e.target.value)
                  if (n >= 1 && n <= messages.length) setAt(n - 1)
                }}
              />{' '}
              of {messages.length}
            </span>
            <Button size="sm" variant="ghost" onClick={() => setAt(at + 1)} disabled={at >= messages.length - 1} aria-label="Next record">
              <Icon name="chevron-right" size={15} />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAt(messages.length - 1)} disabled={at >= messages.length - 1} aria-label="Last record">
              <Icon name="chevrons-right" size={15} />
            </Button>
          </div>
          <span className="hidden md:inline text-[11px] text-navy/35">Use the arrow keys</span>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={copy}>
              <Icon name={copied ? 'check' : 'copy'} size={14} className={copied ? 'text-emerald-600' : ''} />
              {copied ? 'Copied' : 'Copy body'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => download(emlName(m), buildEml(m, { from: from || undefined, attachments: filesFor(m, files) }), 'message/rfc822')}
              disabled={!m.to.length}
            >
              <Icon name="download" size={14} />
              .eml
            </Button>
            <Button size="sm" variant="danger" onClick={() => onExclude(m.index)}>
              <Icon name="x" size={14} />
              Exclude
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs px-1">
          <Badge tone={st.tone} dot>
            {st.label}
          </Badge>
          <span className="text-navy/45">
            Record #{m.record}
            {m.sequence > 0 && <> · Sequence #{m.sequence}</>}
          </span>
          {m.skipped && <Badge tone="amber">Skipped: {m.skipped}</Badge>}
          {m.issues.map(i => (
            <Badge key={i.message} tone={i.level === 'error' ? 'red' : 'amber'}>
              {i.message}
            </Badge>
          ))}
        </div>

        <div key={m.index} className="animate-fade-in">
          <MessageView m={m} files={files} from={from} />
        </div>
      </div>
    </div>
  )
}
