'use client'

import { useEffect, useState } from 'react'
import { buildEml, emlName, messageRows, printDocument, toCsv, toXlsx, zip, type MergedMessage } from '../core'
import type { MergeFile } from './ComposeStep'
import { Avatar, Badge, Button, Icon, Label, Modal, Notice, Panel, Stat, download, inputClass, type IconName } from './kit'
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

const STATUS_TONE = { sent: 'green', skipped: 'amber', failed: 'red', unknown: 'red' } as const

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
  const [confirming, setConfirming] = useState(false)
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
  const plural = ready.length === 1 ? '' : 's'

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

  /** Runs after the person confirmed in the dialog. */
  async function send() {
    if (!onSend) return
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
  const pct = progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0

  const exports: { title: string; text: string; icon: IconName; action: string; primary?: boolean; run: () => void | Promise<void> }[] = [
    { title: 'Email drafts (.eml)', text: 'A zip with one draft per person. Double-click to open it in Outlook, ready to send.', icon: 'mail', action: `Download ${ready.length} draft${plural}`, primary: true, run: emlZip },
    { title: 'Print or PDF', text: 'Every merged message on its own page. Choose Save as PDF for a file.', icon: 'printer', action: 'Print', run: print },
    {
      title: 'Excel',
      text: 'One row per message: To, CC, Subject, Body and attachments.',
      icon: 'table',
      action: 'Download .xlsx',
      run: () => download(`${base}.xlsx`, toXlsx(messageRows(ready)), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    },
    { title: 'CSV', text: 'The same rows as plain CSV (UTF-8).', icon: 'file-text', action: 'Download .csv', run: () => download(`${base}.csv`, toCsv(messageRows(ready)), 'text/csv;charset=utf-8') },
  ]

  return (
    <div className="space-y-5">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat icon="check-circle" tone="green" value={ready.length} label="ready to send" />
        <Stat icon="send" value={done.length} label="already sent" />
        <Stat icon="alert" tone="red" value={blocked} label="with errors, left out" />
        <Stat icon="copy" tone="amber" value={skipped} label="duplicates skipped" />
      </div>

      {blocked > 0 && (
        <Notice tone="red">
          <p className="font-semibold">
            {blocked} email{blocked === 1 ? '' : 's'} will not go out until these are fixed
          </p>
          <ul className="mt-1.5 space-y-1">
            {Array.from(reasons).map(([reason, records]) => (
              <li key={reason}>
                {reason} <span className="text-red-700/70">(record{records.length === 1 ? '' : 's'} {records.map(r => `#${r}`).join(', ')})</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-red-800/80">Go back and fix these, or exclude those people on the previous step.</p>
        </Notice>
      )}
      {done.length > 0 && !ready.length && !blocked && (
        <Notice tone="green">Everything in this list has been sent. The results are below.</Notice>
      )}

      {onSend && (
        <section className="relative overflow-clip bg-navy text-white rounded-2xl shadow-lift">
          <div className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-orange/25 blur-3xl" aria-hidden="true" />
          <div className="relative p-6 sm:p-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-orange">
                <Icon name="send" size={15} />
                Send from Outlook
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight">
                {ready.length ? `${ready.length} personalised email${plural}, one per person` : 'Nothing is ready to send'}
              </h2>
              <p className="mt-1.5 text-sm text-white/65 max-w-xl">Each email goes out on its own, so recipients never see each other. Replies come back to the mailbox it was sent from.</p>
              {senders && senders.length > 1 ? (
                <label className="mt-5 block max-w-sm">
                  <span className="block text-xs font-semibold text-white/60 mb-1.5">Send from</span>
                  <select
                    className="w-full h-10 rounded-lg bg-white/10 border border-white/15 px-3 text-sm text-white focus:outline-none focus:border-orange focus:shadow-glow [&>option]:text-navy"
                    value={sender}
                    onChange={e => setSender(e.target.value)}
                    disabled={!!busy}
                  >
                    {senders.map(s => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                sender && (
                  <p className="mt-5 inline-flex items-center gap-2.5 rounded-lg bg-white/10 px-3 py-2 text-sm">
                    <Avatar text={sender} size={24} />
                    <span className="text-white/60">From</span>
                    <span className="font-semibold">{sender}</span>
                  </p>
                )
              )}
            </div>
            <div className="lg:min-w-[260px]">
              <Button variant="primary" size="lg" className="w-full" disabled={!ready.length || !!busy} onClick={() => setConfirming(true)}>
                <Icon name="send" size={17} />
                {progress ? `Sending ${progress.done} of ${progress.total}` : `Send ${ready.length} email${plural}`}
              </Button>
            </div>
          </div>
          {progress && (
            <div className="relative px-6 sm:px-7 pb-6" role="status">
              <div className="flex justify-between text-xs text-white/60 mb-1.5">
                <span>Sending through Outlook. Keep this tab open.</span>
                <span className="tabular-nums font-semibold text-white">{pct}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full bg-orange transition-[width] duration-500" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
        </section>
      )}

      {result && (
        <div className="animate-fade-up">
          <Notice tone={result.ok ? 'green' : 'red'}>{result.text}</Notice>
        </div>
      )}

      <Panel title={onSend ? 'Or export instead' : 'Finish and merge'} icon="download" subtitle="Files are built in this browser">
        <label className="block mb-5 max-w-md">
          <Label hint="(optional, written into the .eml files)">From</Label>
          <input className={inputClass} value={from} onChange={e => onFrom(e.target.value)} placeholder="Your Name <you@company.com>" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          {exports.map(x => (
            <div key={x.title} className="group flex gap-4 rounded-xl border border-line p-4 transition-all hover:border-navy/20 hover:shadow-card">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-700">
                <Icon name={x.icon} size={18} />
              </span>
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                <div>
                  <p className="text-sm font-bold text-navy">{x.title}</p>
                  <p className="text-xs text-navy/55 mt-0.5">{x.text}</p>
                </div>
                <div>
                  <Button size="sm" variant={x.primary && !onSend ? 'primary' : 'secondary'} disabled={!ready.length || !!busy} onClick={() => run(x.title, x.run)}>
                    <Icon name="download" size={14} />
                    {x.action}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {history.length > 0 && (
        <Panel title="Send results" icon="inbox" subtitle={`${history.length} email${history.length === 1 ? '' : 's'} in this merge`} bodyClassName="p-2">
          <ul className="max-h-80 overflow-y-auto scroll-thin">
            {history.map(m => {
              const r = sent.get(m.index)!
              return (
                <li key={m.index} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-canvas">
                  <Avatar text={m.to[0] ?? '?'} size={30} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold text-navy truncate">{m.to.join(', ')}</span>
                    <span className="block text-xs text-navy/50 truncate">{r.message ?? `Record #${m.record}`}</span>
                  </span>
                  <Badge tone={STATUS_TONE[r.status]} dot>
                    {r.status === 'unknown' ? 'Unconfirmed' : r.status[0].toUpperCase() + r.status.slice(1)}
                  </Badge>
                </li>
              )
            })}
          </ul>
          <p className="px-3 pt-2 pb-1 text-xs text-navy/50 border-t border-line mt-1">
            Sent and unconfirmed records are locked so they are never sent twice. Skipped and failed ones can be sent again after fixing.
          </p>
        </Panel>
      )}

      <Modal open={confirming} onClose={() => setConfirming(false)} label="Confirm send">
        <div className="p-6">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-orange-50 text-orange-700">
            <Icon name="send" size={22} />
          </span>
          <h2 className="mt-4 text-xl font-bold text-navy">
            Send {ready.length} email{plural} now?
          </h2>
          <p className="mt-1.5 text-sm text-navy/60">
            {sender ? (
              <>
                They go out from <strong className="text-navy">{sender}</strong>, one per person.
              </>
            ) : (
              'They go out from your Outlook mailbox, one per person.'
            )}{' '}
            This cannot be undone.
          </p>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-line bg-canvas/60 rounded-b-2xl">
          <Button onClick={() => setConfirming(false)}>Cancel</Button>
          <Button
            variant="primary"
            autoFocus
            onClick={() => {
              setConfirming(false)
              void run('send', send)
            }}
          >
            <Icon name="send" size={15} />
            Send now
          </Button>
        </div>
      </Modal>
    </div>
  )
}
