'use client'

import { useEffect, useState } from 'react'
import { buildEml, emlName, type MergedMessage, type Row } from '../core'
import type { MergeFile } from './ComposeStep'
import { Badge, Button, Panel, download, inputClass } from './kit'

export function filesFor(m: MergedMessage, files: MergeFile[]): MergeFile[] {
  const named = new Set(m.attachments.map(a => a.toLowerCase()))
  return files.filter(f => f.shared || named.has(f.name.toLowerCase()))
}

export function MessageView({ m, files }: { m: MergedMessage; files: MergeFile[] }) {
  const attached = filesFor(m, files)
  return (
    <div className="bg-white border border-slate-200">
      <dl className="grid grid-cols-[70px_1fr] gap-x-3 gap-y-1 px-4 py-3 border-b border-slate-200 text-sm">
        <dt className="text-slate-500">To</dt>
        <dd className="text-slate-900 break-all">{m.to.join(', ') || <span className="text-red-600">(none)</span>}</dd>
        {m.cc.length > 0 && (
          <>
            <dt className="text-slate-500">CC</dt>
            <dd className="break-all">{m.cc.join(', ')}</dd>
          </>
        )}
        {m.bcc.length > 0 && (
          <>
            <dt className="text-slate-500">BCC</dt>
            <dd className="break-all">{m.bcc.join(', ')}</dd>
          </>
        )}
        <dt className="text-slate-500">Subject</dt>
        <dd className="font-semibold text-slate-900">{m.subject || <span className="text-red-600 font-normal">(blank)</span>}</dd>
        {attached.length > 0 && (
          <>
            <dt className="text-slate-500">Attached</dt>
            <dd className="flex flex-wrap gap-1">{attached.map(f => <Badge key={f.name}>{f.name}</Badge>)}</dd>
          </>
        )}
      </dl>
      {m.format === 'html' ? (
        // Sandboxed with no permissions: scripts, forms and navigation in the template cannot run.
        <iframe title="Merged message" sandbox="" srcDoc={m.body} className="w-full h-[460px] bg-white" />
      ) : (
        <div className="px-4 py-4 whitespace-pre-wrap text-sm text-slate-800 min-h-[300px] font-[inherit]">{m.body}</div>
      )}
    </div>
  )
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
  const [showAll, setShowAll] = useState(false)
  useEffect(() => {
    if (at >= messages.length) setAt(Math.max(0, messages.length - 1))
  }, [messages.length, at])

  if (!messages.length) return <p className="text-sm text-slate-500">No records are selected. Tick some on the Recipients step.</p>

  const m = messages[Math.min(at, messages.length - 1)]
  const problems = messages.map((x, i) => ({ x, i })).filter(({ x }) => x.skipped || x.issues.length)

  function findNext() {
    const q = find.trim().toLowerCase()
    if (!q) return
    for (let k = 1; k <= messages.length; k++) {
      const i = (at + k) % messages.length
      if (Object.values(rows[messages[i].index]).some(v => v.toLowerCase().includes(q))) {
        setAt(i)
        return
      }
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setAt(0)} disabled={at === 0} aria-label="First record">|&lt;</Button>
          <Button onClick={() => setAt(at - 1)} disabled={at === 0} aria-label="Previous record">&lt;</Button>
          <span className="text-sm text-slate-700 px-1">
            Recipient
            <input
              className={`${inputClass} w-16 mx-1.5 inline-block text-center`}
              value={at + 1}
              onChange={e => {
                const n = Number(e.target.value)
                if (n >= 1 && n <= messages.length) setAt(n - 1)
              }}
            />
            of {messages.length}
          </span>
          <Button onClick={() => setAt(at + 1)} disabled={at >= messages.length - 1} aria-label="Next record">&gt;</Button>
          <Button onClick={() => setAt(messages.length - 1)} disabled={at >= messages.length - 1} aria-label="Last record">&gt;|</Button>
          <div className="flex items-center gap-1 ml-auto">
            <input
              className={`${inputClass} w-44`}
              placeholder="Find a recipient"
              value={find}
              onChange={e => setFind(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && findNext()}
            />
            <Button onClick={findNext}>Find</Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500">
            Record #{m.record}
            {m.sequence > 0 && <> · Sequence #{m.sequence}</>}
          </span>
          {m.skipped && <Badge tone="amber">Skipped: {m.skipped}</Badge>}
          {m.issues.map(i => (
            <Badge key={i.message} tone={i.level === 'error' ? 'red' : 'amber'}>
              {i.message}
            </Badge>
          ))}
          {!m.skipped && !m.issues.length && <Badge tone="green">Ready</Badge>}
        </div>

        <MessageView m={m} files={files} />

        <div className="flex flex-wrap gap-2">
          <Button variant="danger" onClick={() => onExclude(m.index)}>Exclude this recipient</Button>
          <Button
            onClick={() => download(emlName(m), buildEml(m, { from: from || undefined, attachments: filesFor(m, files) }), 'message/rfc822')}
            disabled={!m.to.length}
          >
            Download this .eml
          </Button>
          <Button onClick={() => void navigator.clipboard?.writeText(m.body)}>Copy body</Button>
        </div>
      </div>

      <aside>
        <Panel
          title={`Check for errors (${problems.length})`}
          actions={
            <label className="flex items-center gap-1 text-xs text-slate-600">
              <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
              list all
            </label>
          }
        >
          {!problems.length && !showAll && <p className="text-sm text-emerald-700">No problems found in {messages.length} records.</p>}
          <ul className="space-y-1 max-h-[60vh] overflow-y-auto">
            {(showAll ? messages.map((x, i) => ({ x, i })) : problems).map(({ x, i }) => (
              <li key={x.index}>
                <button
                  type="button"
                  onClick={() => setAt(i)}
                  className={`w-full text-left px-2 py-1.5 text-xs border ${i === at ? 'border-orange-300 bg-orange-50' : 'border-transparent hover:bg-slate-50'}`}
                >
                  <span className="font-medium text-slate-800">#{x.record} {x.to[0] ?? '(no address)'}</span>
                  <span className="block text-slate-500">
                    {x.skipped ?? (x.issues.map(p => p.message).join(' · ') || 'Ready')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </aside>
    </div>
  )
}
