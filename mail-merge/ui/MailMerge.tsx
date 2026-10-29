'use client'

/**
 * Mail merge, step by step like Word's wizard:
 * 1 Recipients list  2 Edit recipients  3 Write  4 Preview  5 Finish & Merge.
 * Everything runs in the browser. Pass `onSend` to add a Send option on the last step.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  EMPTY_SETTINGS,
  arrange,
  compile,
  duplicateRows,
  guessEmailColumn,
  mergeRecords,
  ready as readyOnly,
  toDataset,
  type Dataset,
  type FilterRule,
  type MergeSettings,
  type Row,
  type SortKey,
} from '../core'
import { ComposeStep, type MergeFile } from './ComposeStep'
import { DataStep, type Source } from './DataStep'
import { FinishStep, type SendHandler, type SendResult } from './FinishStep'
import { PreviewStep } from './PreviewStep'
import { RecipientsStep } from './RecipientsStep'
import { Button } from './kit'

export type { OutgoingMessage, SendHandler, SendResult } from './FinishStep'

const STEPS = ['Select recipients', 'Edit recipient list', 'Write your email', 'Preview results', 'Finish & merge'] as const

export interface MailMergeProps {
  /** Adds a Send option. Receives only messages with no errors that were not sent already. */
  onSend?: SendHandler
  /** Who the Send option sends as, shown before sending. */
  sendFrom?: string
  /** Mailboxes the person may choose to send from. */
  senders?: string[]
  /** localStorage key for the draft subject and body. Set to null to turn saving off. */
  storageKey?: string | null
}

export function MailMerge({ onSend, sendFrom, senders, storageKey = 'mail-merge:draft' }: MailMergeProps) {
  const [sent, setSent] = useState<Map<number, SendResult>>(new Map())
  const [step, setStep] = useState(0)
  const [source, setSource] = useState<Source | null>(null)
  const [dataset, setDataset] = useState<Dataset>({ headers: [], rows: [] })
  const [excluded, setExcluded] = useState<Set<number>>(new Set())
  const [rules, setRules] = useState<FilterRule[]>([])
  const [sorts, setSorts] = useState<SortKey[]>([])
  const [settings, setSettings] = useState<MergeSettings>(EMPTY_SETTINGS)
  const [files, setFiles] = useState<MergeFile[]>([])
  const [from, setFrom] = useState('')

  // Restore the last subject and body. Browser storage can be missing or blocked.
  useEffect(() => {
    if (!storageKey) return
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null')
      if (saved && typeof saved === 'object')
        setSettings(s => ({ ...s, subject: saved.subject ?? '', body: saved.body ?? '', cc: saved.cc ?? '', bcc: saved.bcc ?? '', format: saved.format === 'html' ? 'html' : 'text' }))
    } catch {}
  }, [storageKey])

  useEffect(() => {
    if (!storageKey) return
    try {
      const { subject, body, cc, bcc, format } = settings
      localStorage.setItem(storageKey, JSON.stringify({ subject, body, cc, bcc, format }))
    } catch {}
  }, [storageKey, settings])

  function changeSource(s: Source | null) {
    setSource(s)
    const ds = s ? toDataset(s.matrix, s.headerRow) : { headers: [], rows: [] }
    setDataset(ds)
    setExcluded(new Set())
    setSent(new Map())
    setRules([])
    setSorts([])
    setSettings(prev => ({ ...prev, toColumn: ds.headers.includes(prev.toColumn) ? prev.toColumn : guessEmailColumn(ds) ?? '', attachmentColumn: '' }))
  }

  const passing = useMemo(() => arrange(dataset.rows, rules, sorts), [dataset.rows, rules, sorts])
  const order = useMemo(() => passing.filter(i => !excluded.has(i)), [passing, excluded])
  const duplicates = useMemo(() => (settings.toColumn ? duplicateRows(dataset.rows, settings.toColumn) : new Set<number>()), [dataset.rows, settings.toColumn])
  const compiled = useMemo(() => compile(settings, dataset.headers), [settings, dataset.headers])
  const messages = useMemo(
    () => mergeRecords(dataset.rows, order, settings, compiled, { availableFiles: files.map(f => f.name) }),
    [dataset.rows, order, settings, compiled, files],
  )
  // Sent or unconfirmed records are never offered again in this merge.
  const ready = useMemo(() => {
    if (compiled.errors.length) return []
    return readyOnly(messages).filter(m => {
      const s = sent.get(m.index)?.status
      return s !== 'sent' && s !== 'unknown'
    })
  }, [messages, compiled.errors.length, sent])

  const blockers: (string | null)[] = [
    dataset.rows.length ? null : 'Load a recipient list first',
    !settings.toColumn ? 'Choose the email column' : order.length ? null : 'Tick at least one recipient',
    compiled.errors.length ? compiled.errors[0] : null,
    null,
    null,
  ]
  const canOpen = (i: number) => blockers.slice(0, i).every(b => !b)

  return (
    <div className="space-y-5">
      <ol className="flex flex-wrap gap-1">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              disabled={!canOpen(i)}
              onClick={() => setStep(i)}
              className={`px-3 py-1.5 text-sm border transition-colors disabled:opacity-40 ${
                i === step ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <span className="mr-1.5 text-xs opacity-70">{i + 1}</span>
              {label}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && <DataStep source={source} dataset={dataset} onSource={changeSource} />}
      {step === 1 && (
        <RecipientsStep
          dataset={dataset}
          onRows={(rows: Row[]) => setDataset(d => ({ ...d, rows }))}
          toColumn={settings.toColumn}
          onToColumn={toColumn => setSettings(s => ({ ...s, toColumn }))}
          excluded={excluded}
          onExcluded={setExcluded}
          rules={rules}
          onRules={setRules}
          sorts={sorts}
          onSorts={setSorts}
          order={passing}
          duplicates={duplicates}
        />
      )}
      {step === 2 && (
        <ComposeStep
          settings={settings}
          onSettings={patch => setSettings(s => ({ ...s, ...patch }))}
          headers={dataset.headers}
          compiled={compiled}
          files={files}
          onFiles={setFiles}
        />
      )}
      {step === 3 && (
        <PreviewStep
          messages={messages}
          rows={dataset.rows}
          files={files}
          from={from}
          onExclude={i => setExcluded(s => new Set(s).add(i))}
        />
      )}
      {step === 4 && (
        <FinishStep
          messages={messages}
          ready={ready}
          files={files}
          from={from}
          onFrom={setFrom}
          onSend={onSend}
          sendFrom={sendFrom}
          senders={senders}
          sent={sent}
          onSent={results => setSent(prev => {
            const next = new Map(prev)
            for (const r of results) next.set(r.index, r)
            return next
          })}
          templateErrors={compiled.errors}
          name={source?.name ?? ''}
        />
      )}

      <div className="flex items-center justify-between border-t border-slate-200 pt-4">
        <Button onClick={() => setStep(step - 1)} disabled={step === 0}>
          Previous
        </Button>
        <span className="text-sm text-red-700">{blockers[step]}</span>
        {step < STEPS.length - 1 && (
          <Button variant="primary" onClick={() => setStep(step + 1)} disabled={!!blockers[step]}>
            Next: {STEPS[step + 1]}
          </Button>
        )}
      </div>
    </div>
  )
}
