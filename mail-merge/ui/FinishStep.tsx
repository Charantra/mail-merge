'use client'

import { useEffect, useState } from 'react'
import { buildEml, emlName, messageRows, printDocument, toCsv, toXlsx, zip, type MergedMessage } from '../core'
import type { MergeFile } from './ComposeStep'
import { Button, Label, Panel, download, inputClass } from './kit'
import { filesFor } from './PreviewStep'

/** A merged message with its attachment files, as handed to `onSend`. */
export type OutgoingMessage = MergedMessage & { files: MergeFile[] }

/** What happened to one message. `unknown` means it may have gone out, so it is never resent automatically. */
export interface SendResult {
  index: number
  status: 'sent' | 'skipped' | 'failed' | 'unknown'
  message?: string
}

export type SendHandler = (
  messages: OutgoingMessage[],
  onProgress: (done: number, total: number) => void,
  /** The data source name, for labelling this send in a tracker. */
  meta: { name: string; from?: string },
) => Promise<SendResult[]>

const STATUS_TONE = { sent: 'text-emerald-700', skipped: 'text-amber-700', failed: 'text-red-700', unknown: 'text-red-700' } as const

export function FinishStep({
  messages,
  ready,
  files,
  from,
  onFrom,
  onSend,
  sendFrom,
  senders,
  sent,
  onSent,
  templateErrors,
  name,
}: {
  messages: MergedMessage[]
  ready: MergedMessage[]
  files: MergeFile[]
  from: string
  onFrom: (s: string) => void
  onSend?: SendHandler
  /** Shown next to the Send button, e.g. the mailbox address. */
  sendFrom?: string
  /** Mailboxes the person may send from; more than one shows a picker. */
  senders?: string[]
  /** Results of earlier sends in this merge, by data source row. */
  sent: Map<number, SendResult>
  onSent: (results: SendResult[]) => void
  /** Template problems that block every record. */
  templateErrors: string[]
  name: string
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [sender, setSender] = useState(sendFrom ?? '')
  useEffect(() => {
    if (sendFrom && !sender) setSender(sendFrom)
  }, [sendFrom, sender])
  const skipped = messages.filter(m => m.skipped).length
  const done = messages.filter(m => {
    const s = sent.get(m.index)?.status
    return s === 'sent' || s === 'unknown'
  })
  const doneSet = new Set(done.map(m => m.index))
  const readySet = new Set(ready.map(m => m.index))
  const blockedList = messages.filter(m => !m.skipped && !doneSet.has(m.index) && !readySet.has(m.index))
  const blocked = blockedList.length
  // Group the reasons so the summary says what to fix, not just how many.
  const reasons = new Map<string, number[]>()
  for (const m of blockedList) {
    const errs = m.issues.filter(i => i.level === 'error').map(i => i.message)
    for (const e of errs.length ? errs : templateErrors.length ? templateErrors : ['Template has errors']) {
      reasons.set(e, [...(reasons.get(e) ?? []), m.record])
    }
  }
  const stamp = new Date().toISOString().slice(0, 10)
  const base = `${name.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*]/g, '_') || 'mail-merge'} ${stamp}`

  async function run(label: string, fn: () => void | Promise<void>) {
    setBusy(label)
    setResult(null)
    try {
      await fn()
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(null)
    }
  }

  function emlZip() {
    const entries = ready.map(m => ({ name: emlName(m), data: buildEml(m, { from: from || undefined, attachments: filesFor(m, files) }) }))
    download(`${base}.zip`, zip(entries), 'application/zip')
  }

  function print() {
    const w = window.open('', '_blank')
    if (!w) throw new Error('The browser blocked the print window. Allow pop-ups for this site.')
    w.document.write(printDocument(ready, { title: base }))
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 300)
  }

  async function send() {
    if (!onSend) return
    const where = sender ? ` from ${sender}` : ''
    if (!window.confirm(`Send ${ready.length} email${ready.length === 1 ? '' : 's'} now${where}? This cannot be undone.`)) return
    setProgress({ done: 0, total: ready.length })
    try {
      const results = await onSend(
        ready.map(m => ({ ...m, files: filesFor(m, files) })),
        (done, total) => setProgress({ done, total }),
        { name: name.replace(/\.[^.]+$/, '') || 'Mail merge', from: sender || undefined },
      )
      onSent(results)
      const count = (s: SendResult['status']) => results.filter(r => r.status === s).length
      const parts = [`${count('sent')} sent`]
      if (count('skipped')) parts.push(`${count('skipped')} skipped`)
      if (count('failed')) parts.push(`${count('failed')} failed`)
      if (count('unknown')) parts.push(`${count('unknown')} unconfirmed`)
      setResult({ ok: count('sent') === results.length, text: parts.join(', ') + '.' })
    } finally {
      setProgress(null)
    }
  }

  const history = messages.filter(m => sent.has(m.index))

  return (
    <div className="space-y-4 max-w-3xl">
      <Panel title="Summary">
        <div className={`grid gap-4 text-center ${done.length ? 'grid-cols-4' : 'grid-cols-3'}`}>
          <div>
            <div className="text-2xl font-semibold text-emerald-700">{ready.length}</div>
            <div className="text-xs text-slate-500">ready</div>
          </div>
          {done.length > 0 && (
            <div>
              <div className="text-2xl font-semibold text-slate-900">{done.length}</div>
              <div className="text-xs text-slate-500">already sent</div>
            </div>
          )}
          <div>
            <div className="text-2xl font-semibold text-red-700">{blocked}</div>
            <div className="text-xs text-slate-500">with errors, left out</div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-amber-700">{skipped}</div>
            <div className="text-xs text-slate-500">duplicates skipped</div>
          </div>
        </div>
        {blocked > 0 && (
          <div className="mt-3 text-sm">
            <ul className="space-y-1 text-red-800">
              {Array.from(reasons).map(([reason, records]) => (
                <li key={reason}>
                  {reason} <span className="text-slate-500">(record{records.length === 1 ? '' : 's'} {records.map(r => `#${r}`).join(', ')})</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-slate-600">Fix these on the earlier steps, or exclude the records on the Preview step.</p>
          </div>
        )}
        {done.length > 0 && !ready.length && !blocked && (
          <p className="mt-3 text-sm text-emerald-700">Everything in this list has been sent. See Send results below.</p>
        )}
      </Panel>

      {onSend && (
        <Panel title="Send email messages">
          {senders && senders.length > 1 && (
            <label className="block mb-3 max-w-md">
              <Label hint="(the email comes from this person, and replies go to their inbox)">Send from</Label>
              <select className={inputClass} value={sender} onChange={e => setSender(e.target.value)} disabled={!!busy}>
                {senders.map(s => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="text-sm text-slate-600 mb-3">
            Sends {ready.length} personalised email{ready.length === 1 ? '' : 's'}, one per recipient
            {sender ? (
              <>
                {' '}from <strong className="text-slate-900">{sender}</strong>
              </>
            ) : null}
            . Each goes out separately, so recipients never see each other.
          </p>
          <div className="flex items-center gap-3">
            <Button variant="primary" className="px-5 py-2" disabled={!ready.length || !!busy} onClick={() => run('send', send)}>
              {progress ? `Sending ${progress.done} of ${progress.total}...` : `Send ${ready.length} email${ready.length === 1 ? '' : 's'}`}
            </Button>
            {progress && (
              <div className="flex-1 h-2 bg-slate-100">
                <div className="h-2 bg-orange-500 transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
              </div>
            )}
          </div>
        </Panel>
      )}

      <Panel title={onSend ? 'Or export instead' : 'Finish & Merge'}>
        <label className="block mb-4 max-w-md">
          <Label hint="(optional, written into the .eml files)">From</Label>
          <input className={inputClass} value={from} onChange={e => onFrom(e.target.value)} placeholder="Your Name <you@company.com>" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Option title="Email drafts (.eml)" text="A zip with one draft per recipient. Double-click to open it in Outlook or Apple Mail, ready to send." >
            <Button variant="primary" disabled={!ready.length || !!busy} onClick={() => run('eml', emlZip)}>
              Download {ready.length} drafts
            </Button>
          </Option>
          <Option title="Print or PDF" text="Every merged message on its own page. Choose Save as PDF in the print dialog for a file.">
            <Button disabled={!ready.length || !!busy} onClick={() => run('print', print)}>Print...</Button>
          </Option>
          <Option title="Excel" text="One row per message: To, CC, Subject, Body and attachments. Good for review or another sender.">
            <Button
              disabled={!ready.length || !!busy}
              onClick={() => run('xlsx', () => download(`${base}.xlsx`, toXlsx(messageRows(ready)), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))}
            >
              Download .xlsx
            </Button>
          </Option>
          <Option title="CSV" text="The same rows as plain CSV (UTF-8).">
            <Button disabled={!ready.length || !!busy} onClick={() => run('csv', () => download(`${base}.csv`, toCsv(messageRows(ready)), 'text/csv;charset=utf-8'))}>
              Download .csv
            </Button>
          </Option>
        </div>
        {result && <p className={`mt-3 text-sm ${result.ok ? 'text-emerald-700' : 'text-red-700'}`}>{result.text}</p>}
      </Panel>

      {history.length > 0 && (
        <Panel title={`Send results (${history.length})`}>
          <ul className="divide-y divide-slate-100 text-sm max-h-80 overflow-y-auto">
            {history.map(m => {
              const r = sent.get(m.index)!
              return (
                <li key={m.index} className="flex items-start justify-between gap-3 py-1.5">
                  <span className="text-slate-800 break-all">
                    #{m.record} {m.to.join(', ')}
                    {r.message && <span className="block text-xs text-slate-500">{r.message}</span>}
                  </span>
                  <span className={`text-xs font-semibold uppercase ${STATUS_TONE[r.status]}`}>{r.status === 'unknown' ? 'unconfirmed' : r.status}</span>
                </li>
              )
            })}
          </ul>
          <p className="mt-2 text-xs text-slate-500">Sent and unconfirmed records are locked so they are never sent twice. Skipped and failed ones can be sent again after fixing.</p>
        </Panel>
      )}
    </div>
  )
}

function Option({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <div className="border border-slate-200 p-3 flex flex-col gap-2">
      <div className="text-sm font-semibold text-slate-800">{title}</div>
      <p className="text-xs text-slate-500 flex-1">{text}</p>
      <div>{children}</div>
    </div>
  )
}
