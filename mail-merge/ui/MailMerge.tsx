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
import { Button, Icon, Kbd, type IconName } from './kit'

export type { OutgoingMessage, SendHandler, SendResult } from './FinishStep'

const STEPS: readonly { title: string; cue: string; next: string; icon: IconName }[] = [
  { title: 'Load the list', cue: 'Drop the spreadsheet', next: 'Choose recipients', icon: 'sheet' },
  { title: 'Choose who receives it', cue: 'Pick the email column', next: 'Write the email', icon: 'users' },
  { title: 'Write the email', cue: 'Subject, then the message', next: 'Preview', icon: 'edit' },
  { title: 'Read one email', cue: 'Check what they will get', next: 'Go to send', icon: 'eye' },
  { title: 'Send', cue: 'Send from Outlook', next: '', icon: 'send' },
]

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
    dataset.rows.length ? null : 'Drop a file, or paste the rows.',
    !settings.toColumn ? 'Choose the column that holds the email address.' : order.length ? null : 'Tick at least one person.',
    compiled.errors.length ? compiled.errors[0] : null,
    null,
    null,
  ]
  const canOpen = (i: number) => blockers.slice(0, i).every(b => !b)
  const selectedCount = order.length
  const prompt =
    step === 0
      ? source
        ? `${dataset.rows.length} record${dataset.rows.length === 1 ? '' : 's'} from ${source.name}. The next step picks who receives the email.`
        : 'Drop an Excel or CSV file in the box. The first row should be the column names.'
      : step === 1
        ? !settings.toColumn
          ? 'Open the list and choose the column that holds the email address.'
          : selectedCount
            ? `${selectedCount} ${selectedCount === 1 ? 'person stays' : 'people stay'} ticked. Untick anyone who should not get this.`
            : 'Tick at least one person in the list.'
        : step === 2
          ? 'Write the subject and the message. Click a column name to drop it in where the cursor is.'
          : step === 3
            ? 'This is one real email. Step through a few people, then send.'
            : ready.length
              ? `${ready.length} email${ready.length === 1 ? '' : 's'} ready to leave Outlook.`
              : 'Nothing is ready to send yet. The notes below say what to fix.'

  const sample = useMemo(() => messages.find(m => !m.skipped) ?? messages[0], [messages])
  const canNext = step < STEPS.length - 1 && !blockers[step]
  const progress = ((step + (blockers[step] ? 0 : 1)) / STEPS.length) * 100

  // Ctrl or Cmd + Enter moves to the next step, like sending a chat message.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canNext) {
        e.preventDefault()
        setStep(s => s + 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canNext])

  const tally = [
    { label: 'Records', value: dataset.rows.length },
    { label: 'Selected', value: selectedCount },
    { label: 'Ready', value: ready.length },
  ]

  return (
    <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,1fr)] content-start lg:content-normal items-stretch">
      <aside className="bg-white border-b lg:border-b-0 lg:border-r border-line lg:sticky lg:top-[72px] lg:h-[calc(100vh-72px)] flex flex-col">
        <div className="hidden lg:block px-5 pt-6 pb-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-navy/40">New merge</p>
          <p className="mt-1 text-[15px] font-bold text-navy truncate">{source?.name ?? 'Untitled merge'}</p>
        </div>
        <nav aria-label="Steps" className="lg:px-3">
          <ol className="flex lg:flex-col gap-1 overflow-x-auto scroll-thin px-3 py-3 lg:p-0">
            {STEPS.map((item, i) => {
              const current = i === step
              const done = i < step && !blockers[i]
              const locked = !canOpen(i)
              return (
                <li key={item.title} className="relative min-w-[12rem] lg:min-w-0">
                  {i < STEPS.length - 1 && (
                    <span
                      className={`hidden lg:block absolute left-[29px] top-[50px] h-[calc(100%-38px)] w-0.5 rounded-full transition-colors duration-500 ${done ? 'bg-orange' : 'bg-line'}`}
                      aria-hidden="true"
                    />
                  )}
                  <button
                    type="button"
                    disabled={locked}
                    aria-current={current ? 'step' : undefined}
                    onClick={() => setStep(i)}
                    className={`group relative w-full text-left px-3 py-2.5 rounded-xl transition-all disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange ${
                      current ? 'bg-orange-50 ring-1 ring-inset ring-orange-300/60' : 'hover:bg-canvas'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-all ${
                          current
                            ? 'bg-orange text-navy shadow-[0_6px_14px_-6px_rgba(255,117,31,0.8)]'
                            : done
                              ? 'bg-navy text-white'
                              : locked
                                ? 'bg-canvas text-navy/25 ring-1 ring-inset ring-line'
                                : 'bg-white text-navy/60 ring-1 ring-inset ring-line group-hover:ring-navy/20'
                        }`}
                        aria-hidden="true"
                      >
                        <Icon name={done ? 'check' : item.icon} size={17} strokeWidth={done ? 2.4 : 1.8} />
                      </span>
                      <span className="min-w-0">
                        <span className={`block text-[11px] font-semibold ${current ? 'text-orange-700' : 'text-navy/40'}`}>Step {i + 1}</span>
                        <span className={`block text-sm font-bold leading-tight truncate ${locked ? 'text-navy/35' : 'text-navy'}`}>{item.title}</span>
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>

        <div className="hidden lg:block mt-auto p-4">
          <div className="rounded-2xl bg-navy text-white p-4 relative overflow-clip">
            <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-orange/30 blur-2xl" aria-hidden="true" />
            <div className="relative flex items-center justify-between text-xs">
              <span className="text-white/60">Progress</span>
              <span className="font-bold tabular-nums">{Math.round(progress)}%</span>
            </div>
            <div className="relative mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden" aria-hidden="true">
              <div className="h-full bg-orange rounded-full transition-[width] duration-500 ease-out" style={{ width: `${progress}%` }} />
            </div>
            <dl className="relative grid grid-cols-3 gap-2 mt-4">
              {tally.map(t => (
                <div key={t.label} className="flex flex-col-reverse">
                  <dt className="text-[10px] uppercase tracking-wider text-white/50 mt-1">{t.label}</dt>
                  <dd className="text-lg font-bold tabular-nums leading-none">{t.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </aside>

      <div className="flex flex-col min-h-0 min-w-0">
        <div className="flex-1 flex flex-col min-h-0 w-full max-w-[1200px] mx-auto px-4 sm:px-8 pt-6 sm:pt-8 pb-8">
          <header key={`h${step}`} className="mb-6 animate-fade-up">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-orange-700">
              Step {step + 1} of {STEPS.length} · {STEPS[step].cue}
            </p>
            <h1 className="text-[26px] sm:text-[30px] font-bold text-navy tracking-tight leading-tight mt-1.5">{STEPS[step].title}</h1>
            <p className="text-[15px] text-navy/60 mt-1.5 max-w-2xl">{prompt}</p>
          </header>

          <div key={step} className="flex-1 flex flex-col min-h-0 animate-fade-up [animation-delay:60ms]">
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
                sample={sample}
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
          </div>
        </div>

        <div className="sticky bottom-0 z-20 px-4 sm:px-8 pb-4 pointer-events-none">
          <div className="max-w-[1200px] mx-auto pointer-events-auto flex flex-wrap items-center gap-3 bg-white/90 backdrop-blur-xl border border-line shadow-lift rounded-2xl p-2">
            <Button variant="ghost" size="lg" onClick={() => setStep(step - 1)} disabled={step === 0}>
              <Icon name="arrow-left" size={17} />
              Back
            </Button>
            <p
              className={`flex-1 min-w-[12rem] flex items-center gap-2 text-sm ${
                step === STEPS.length - 1 ? 'text-navy/60' : blockers[step] ? 'text-red-700 font-semibold' : 'text-emerald-700 font-semibold'
              }`}
              role="status"
            >
              {step < STEPS.length - 1 && (
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${blockers[step] ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}
                  aria-hidden="true"
                >
                  <Icon name={blockers[step] ? 'alert' : 'check'} size={13} strokeWidth={2.4} />
                </span>
              )}
              {step === STEPS.length - 1 ? 'Last step. Send now, or export the drafts.' : blockers[step] ?? 'This step is done.'}
            </p>
            {step < STEPS.length - 1 && (
              <Button variant="primary" size="lg" className="group" onClick={() => setStep(step + 1)} disabled={!!blockers[step]}>
                {STEPS[step].next}
                <span className="hidden md:inline-flex">
                  <Kbd>Ctrl ↵</Kbd>
                </span>
                <Icon name="arrow-right" size={17} className="transition-transform group-hover:translate-x-0.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
