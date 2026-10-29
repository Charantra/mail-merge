'use client'

import { useRef, useState } from 'react'
import { FILTERS, OPERATORS, isUnary, type Attachment, type Compiled, type MergedMessage, type MergeSettings, type Op } from '../core'
import { Badge, Button, Icon, Label, Notice, Panel, Segmented, Switch, inputClass, type IconName } from './kit'
import { MessageView } from './PreviewStep'

export type MergeFile = Attachment & { shared: boolean }

type Target = 'subject' | 'body' | 'cc' | 'bcc'

function quote(s: string): string {
  return `"${s.replace(/"/g, "'")}"`
}

export function ComposeStep({
  settings,
  onSettings,
  headers,
  compiled,
  files,
  onFiles,
  sample,
}: {
  settings: MergeSettings
  onSettings: (patch: Partial<MergeSettings>) => void
  headers: string[]
  compiled: Compiled
  files: MergeFile[]
  onFiles: (f: MergeFile[]) => void
  /** The first merged message, for the live preview. */
  sample?: MergedMessage
}) {
  const refs = {
    subject: useRef<HTMLInputElement>(null),
    body: useRef<HTMLTextAreaElement>(null),
    cc: useRef<HTMLInputElement>(null),
    bcc: useRef<HTMLInputElement>(null),
  }
  const [target, setTarget] = useState<Target>('body')
  const [tool, setTool] = useState<'greeting' | 'if' | 'format' | 'fill' | null>(null)
  const [help, setHelp] = useState(false)
  const [view, setView] = useState<'edit' | 'preview'>('edit')
  const [fieldSearch, setFieldSearch] = useState('')
  const sharedRef = useRef<HTMLInputElement>(null)
  const poolRef = useRef<HTMLInputElement>(null)

  // Builders' own state
  const nameField = headers.find(h => /first\s*name/i.test(h)) ?? headers.find(h => /name/i.test(h)) ?? headers[0] ?? ''
  const [greet, setGreet] = useState({ word: 'Dear', field: nameField, filter: '', fallback: 'Sir or Madam', end: ',' })
  const [cond, setCond] = useState<{ field: string; op: Op; value: string; then: string; otherwise: string }>({
    field: headers[0] ?? '',
    op: 'eq',
    value: '',
    then: '',
    otherwise: '',
  })
  const [fmt, setFmt] = useState({ field: headers[0] ?? '', filter: 'upper', arg: '' })
  const [fill, setFill] = useState('')

  /** Insert at the cursor of the last focused box, as Word's Insert Merge Field does. */
  function insert(text: string) {
    const el = refs[target].current
    const value = settings[target]
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    onSettings({ [target]: value.slice(0, start) + text + value.slice(end) })
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      el.setSelectionRange(start + text.length, start + text.length)
    })
  }

  async function addFiles(list: FileList | null, shared: boolean) {
    if (!list) return
    const added: MergeFile[] = []
    for (const f of Array.from(list)) added.push({ name: f.name, type: f.type, bytes: new Uint8Array(await f.arrayBuffer()), shared })
    const names = new Set(added.map(a => a.name.toLowerCase()))
    onFiles([...files.filter(f => !names.has(f.name.toLowerCase())), ...added])
  }

  const focus = (t: Target) => () => setTarget(t)
  const totalMb = files.reduce((n, f) => n + f.bytes.length, 0) / 1048576

  const shownFields = headers.filter(h => h.toLowerCase().includes(fieldSearch.trim().toLowerCase()))
  const row = 'grid grid-cols-[64px_1fr] items-center gap-3 px-5 border-b border-line'
  const bare = 'w-full bg-transparent py-3 text-sm text-navy placeholder:text-navy/30 focus:outline-none'
  const TOOLS: { id: NonNullable<typeof tool>; label: string; icon: IconName }[] = [
    { id: 'greeting', label: 'Greeting line', icon: 'user' },
    { id: 'if', label: 'If, then, else', icon: 'braces' },
    { id: 'format', label: 'Formatted field', icon: 'wand' },
    { id: 'fill', label: 'Fill-in', icon: 'edit' },
  ]
  const QUICK: { label: string; text: string; icon: IconName }[] = [
    { label: 'Record #', text: '{{@record}}', icon: 'hash' },
    { label: 'Sequence #', text: '{{@sequence}}', icon: 'hash' },
    { label: 'Today', text: '{{@date}}', icon: 'calendar' },
  ]

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] items-start">
      <div className="space-y-4 min-w-0">
        <section className="bg-white border border-line rounded-2xl shadow-card overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-line bg-canvas/60">
            <div className="flex items-center gap-2">
              <span className="flex gap-1.5" aria-hidden="true">
                <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
              </span>
              <span className="ml-2 text-sm font-bold text-navy">New message</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                size="sm"
                value={settings.format}
                options={[
                  { value: 'text', label: 'Plain text' },
                  { value: 'html', label: 'HTML' },
                ]}
                onChange={format => onSettings({ format })}
              />
              <Segmented
                size="sm"
                value={view}
                options={[
                  { value: 'edit', label: <><Icon name="edit" size={13} />Write</> },
                  { value: 'preview', label: <><Icon name="eye" size={13} />Preview</> },
                ]}
                onChange={setView}
              />
            </div>
          </header>

          {view === 'preview' ? (
            <div className="p-4 bg-canvas/40">
              {sample ? (
                <>
                  <p className="text-xs text-navy/50 mb-2 flex items-center gap-1.5">
                    <Icon name="eye" size={13} />
                    As record #{sample.record} will get it. The next step steps through everyone.
                  </p>
                  <MessageView m={sample} files={files} />
                </>
              ) : (
                <p className="text-sm text-navy/55 py-10 text-center">Nobody is ticked, so there is no one to preview.</p>
              )}
            </div>
          ) : (
            <>
              <div className={row}>
                <span className="text-xs font-semibold text-navy/45">To</span>
                <span className="py-2.5">
                  {settings.toColumn ? (
                    <span className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-orange-50 ring-1 ring-inset ring-orange-300/50 text-[13px] font-semibold text-orange-700">
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-white">
                        <Icon name="users" size={11} />
                      </span>
                      Each person in {settings.toColumn}
                    </span>
                  ) : (
                    <Badge tone="red">Choose the email column on the Recipients step</Badge>
                  )}
                </span>
              </div>
              <div className={`${row} ${target === 'cc' ? 'bg-orange-50/40' : ''}`}>
                <label htmlFor="mm-cc" className="text-xs font-semibold text-navy/45">CC</label>
                <input id="mm-cc" ref={refs.cc} onFocus={focus('cc')} className={bare} value={settings.cc} onChange={e => onSettings({ cc: e.target.value })} placeholder="Optional. A fixed address or a field" />
              </div>
              <div className={`${row} ${target === 'bcc' ? 'bg-orange-50/40' : ''}`}>
                <label htmlFor="mm-bcc" className="text-xs font-semibold text-navy/45">BCC</label>
                <input id="mm-bcc" ref={refs.bcc} onFocus={focus('bcc')} className={bare} value={settings.bcc} onChange={e => onSettings({ bcc: e.target.value })} placeholder="Optional" />
              </div>
              <div className={`${row} ${target === 'subject' ? 'bg-orange-50/40' : ''}`}>
                <label htmlFor="mm-subject" className="text-xs font-semibold text-navy/45">Subject</label>
                <input
                  id="mm-subject"
                  ref={refs.subject}
                  onFocus={focus('subject')}
                  className={`${bare} text-[15px] font-semibold`}
                  value={settings.subject}
                  onChange={e => onSettings({ subject: e.target.value })}
                  placeholder="e.g. {{Company}} x Charantra"
                />
              </div>
              <textarea
                ref={refs.body}
                onFocus={focus('body')}
                value={settings.body}
                onChange={e => onSettings({ body: e.target.value })}
                rows={16}
                spellCheck
                aria-label="Message"
                placeholder={'Dear {{First Name | default:"Sir or Madam"}},\n\nI am writing about {{Company}}...'}
                className="block w-full resize-y bg-transparent px-5 py-4 font-mono text-[13px] leading-relaxed text-navy placeholder:text-navy/30 focus:outline-none min-h-[320px]"
              />
              <footer className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 border-t border-line bg-canvas/60 text-xs text-navy/45">
                <span>
                  {settings.format === 'html' ? 'HTML body. Merged values are escaped, so data cannot inject markup.' : 'Click a field on the right to drop it in at the cursor.'}
                </span>
                <span className="tabular-nums">{settings.body.length} characters</span>
              </footer>
            </>
          )}
        </section>

        {(compiled.errors.length > 0 || compiled.unknownFields.length > 0) && (
          <Notice tone="red">
            <div className="space-y-1">
              {compiled.errors.map(e => (
                <p key={e}>{e}</p>
              ))}
              {compiled.unknownFields.length > 0 && (
                <p>
                  Not a column in the data source: {compiled.unknownFields.map(f => `{{${f}}}`).join(', ')}. These merge as blank.
                </p>
              )}
            </div>
          </Notice>
        )}

        {compiled.fills.length > 0 && (
          <Panel title="Fill-in answers" icon="edit" subtitle="Answered once, used for every record">
            <div className="grid gap-3 sm:grid-cols-2">
              {compiled.fills.map(p => (
                <label key={p} className="block">
                  <Label>{p}</Label>
                  <input
                    className={inputClass}
                    value={settings.fills[p] ?? ''}
                    onChange={e => onSettings({ fills: { ...settings.fills, [p]: e.target.value } })}
                  />
                </label>
              ))}
            </div>
          </Panel>
        )}

        <Panel title="Attachments" icon="paperclip" subtitle={files.length ? `${files.length} file${files.length === 1 ? '' : 's'} · ${totalMb.toFixed(1)} MB` : 'Optional'}>
          <div className="grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => sharedRef.current?.click()}
              className="group flex items-center gap-3 rounded-xl border border-dashed border-navy/20 px-4 py-3.5 text-left transition-all hover:border-orange hover:bg-orange-50/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-navy/[0.05] text-navy/60 group-hover:bg-orange group-hover:text-navy transition-colors">
                <Icon name="plus" size={16} />
              </span>
              <span>
                <span className="block text-sm font-bold text-navy">Same files for everyone</span>
                <span className="block text-xs text-navy/50">A deck or one-pager every person gets</span>
              </span>
            </button>
            <input ref={sharedRef} type="file" multiple className="hidden" onChange={e => { void addFiles(e.target.files, true); e.target.value = '' }} />
            <div className="rounded-xl border border-line px-4 py-3">
              <Label hint="(file names in a column, split by ;)">Per-record files</Label>
              <div className="flex gap-2">
                <select className={inputClass} value={settings.attachmentColumn} onChange={e => onSettings({ attachmentColumn: e.target.value })}>
                  <option value="">No attachment column</option>
                  {headers.map(h => (
                    <option key={h}>{h}</option>
                  ))}
                </select>
                <Button onClick={() => poolRef.current?.click()} disabled={!settings.attachmentColumn}>
                  <Icon name="plus" size={14} />
                  Add
                </Button>
                <input ref={poolRef} type="file" multiple className="hidden" onChange={e => { void addFiles(e.target.files, false); e.target.value = '' }} />
              </div>
            </div>
          </div>
          {files.length > 0 && (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {files.map(f => (
                <li key={f.name} className="group flex items-center gap-3 rounded-xl border border-line bg-canvas/50 px-3 py-2 animate-fade-up">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white border border-line text-navy/60">
                    <Icon name="file-text" size={15} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold text-navy truncate">{f.name}</span>
                    <span className="block text-[11px] text-navy/45">
                      {(f.bytes.length / 1024).toFixed(0)} KB · {f.shared ? 'Everyone' : 'When named in the column'}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="grid h-7 w-7 place-items-center rounded-lg text-navy/35 hover:text-red-600 hover:bg-red-50"
                    aria-label={`Remove ${f.name}`}
                    onClick={() => onFiles(files.filter(x => x !== f))}
                  >
                    <Icon name="x" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {totalMb > 20 && (
            <div className="mt-3">
              <Notice tone="amber">{totalMb.toFixed(1)} MB in total. Most mail servers reject messages over 20 to 25 MB.</Notice>
            </div>
          )}
        </Panel>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-24">
        <Panel
          title="Merge fields"
          icon="braces"
          actions={<Badge tone="orange">into {target}</Badge>}
          bodyClassName="p-4"
        >
          {headers.length > 8 && (
            <div className="relative mb-3">
              <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy/35 pointer-events-none" />
              <input className={`${inputClass} pl-8 py-1.5`} placeholder="Find a column" value={fieldSearch} onChange={e => setFieldSearch(e.target.value)} />
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto scroll-thin">
            {shownFields.map(h => (
              <button
                key={h}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => insert(`{{${h}}}`)}
                title={`Insert {{${h}}}`}
                className="group inline-flex items-center gap-1 pl-2 pr-2.5 py-1 text-xs font-semibold border border-line bg-white text-navy rounded-full transition-all hover:border-orange hover:bg-orange-50 hover:text-orange-700 hover:-translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange"
              >
                <Icon name="plus" size={12} className="text-navy/30 group-hover:text-orange-700" />
                {h}
              </button>
            ))}
            {!shownFields.length && <p className="text-xs text-navy/45">No column matches.</p>}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-line">
            {QUICK.map(q => (
              <button
                key={q.text}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => insert(q.text)}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md bg-navy/[0.05] text-navy/65 hover:bg-navy hover:text-white transition-colors"
              >
                <Icon name={q.icon} size={11} />
                {q.label}
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Smart blocks" icon="zap" actions={
          <button type="button" onClick={() => setHelp(h => !h)} className="text-xs font-semibold text-navy/50 hover:text-navy">
            {help ? 'Hide syntax' : 'Syntax'}
          </button>
        } bodyClassName="p-4">
          <div className="grid grid-cols-2 gap-2">
            {TOOLS.map(t => {
              const on = tool === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-expanded={on}
                  onClick={() => setTool(on ? null : t.id)}
                  className={`flex flex-col items-start gap-2 rounded-xl border px-3 py-2.5 text-left transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange ${
                    on ? 'border-orange bg-orange-50 ring-4 ring-orange/10' : 'border-line hover:border-navy/20 hover:bg-canvas'
                  }`}
                >
                  <span className={`grid h-7 w-7 place-items-center rounded-lg ${on ? 'bg-orange text-navy' : 'bg-navy/[0.05] text-navy/60'}`}>
                    <Icon name={t.icon} size={14} />
                  </span>
                  <span className="text-xs font-bold text-navy">{t.label}</span>
                </button>
              )
            })}
          </div>

          {tool === 'greeting' && (
            <div className="mt-4 space-y-2.5 animate-fade-up">
              <div className="grid grid-cols-[1fr_1.4fr_60px] gap-1.5">
                <select className={inputClass} value={greet.word} onChange={e => setGreet({ ...greet, word: e.target.value })}>
                  {['Dear', 'Hi', 'Hello', 'To'].map(w => <option key={w}>{w}</option>)}
                </select>
                <select className={inputClass} value={greet.field} onChange={e => setGreet({ ...greet, field: e.target.value })}>
                  {headers.map(h => <option key={h}>{h}</option>)}
                </select>
                <select className={inputClass} value={greet.end} onChange={e => setGreet({ ...greet, end: e.target.value })}>
                  {[',', ':', '', '!'].map(p => <option key={p} value={p}>{p || '(none)'}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-xs text-navy/70">
                <input type="checkbox" checked={greet.filter === 'first'} onChange={e => setGreet({ ...greet, filter: e.target.checked ? 'first' : '' })} />
                Use only the first word (first name from a full name)
              </label>
              <label className="block">
                <Label>When the name is blank</Label>
                <input className={inputClass} value={greet.fallback} onChange={e => setGreet({ ...greet, fallback: e.target.value })} />
              </label>
              <p className="rounded-lg bg-canvas px-3 py-2 text-xs text-navy/60">
                Reads as: <span className="font-semibold text-navy">{greet.word} {`{${greet.field}}`}{greet.end}</span>
              </p>
              <Button
                variant="primary"
                className="w-full"
                onMouseDown={e => e.preventDefault()}
                onClick={() => insert(`${greet.word} {{${greet.field}${greet.filter ? ' | first' : ''} | default:${quote(greet.fallback)}}}${greet.end}`)}
              >
                Insert greeting
              </Button>
            </div>
          )}

          {tool === 'if' && (
            <div className="mt-4 space-y-2 animate-fade-up">
              <Label>If</Label>
              <select className={inputClass} value={cond.field} onChange={e => setCond({ ...cond, field: e.target.value })}>
                {headers.map(h => <option key={h}>{h}</option>)}
              </select>
              <select className={inputClass} value={cond.op} onChange={e => setCond({ ...cond, op: e.target.value as Op })}>
                {OPERATORS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              {!isUnary(cond.op) && <input className={inputClass} placeholder="Compare to" value={cond.value} onChange={e => setCond({ ...cond, value: e.target.value })} />}
              <Label>Then insert this text</Label>
              <textarea className={inputClass} rows={2} value={cond.then} onChange={e => setCond({ ...cond, then: e.target.value })} />
              <Label>Otherwise insert this text</Label>
              <textarea className={inputClass} rows={2} value={cond.otherwise} onChange={e => setCond({ ...cond, otherwise: e.target.value })} />
              <Button
                variant="primary"
                className="w-full"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  const op = OPERATORS.find(o => o.id === cond.op)!.syntax[0]
                  const test = isUnary(cond.op) ? `[${cond.field}] ${op}` : `[${cond.field}] ${op} ${quote(cond.value)}`
                  insert(`{{#if ${test}}}${cond.then}${cond.otherwise ? `{{else}}${cond.otherwise}` : ''}{{/if}}`)
                }}
              >
                Insert rule
              </Button>
            </div>
          )}

          {tool === 'format' && (
            <div className="mt-4 space-y-2 animate-fade-up">
              <select className={inputClass} value={fmt.field} onChange={e => setFmt({ ...fmt, field: e.target.value })}>
                {headers.map(h => <option key={h}>{h}</option>)}
              </select>
              <select className={inputClass} value={fmt.filter} onChange={e => setFmt({ ...fmt, filter: e.target.value, arg: '' })}>
                {Object.entries(FILTERS).map(([k, f]) => <option key={k} value={k}>{k}: {f.help}</option>)}
              </select>
              {['default', 'truncate', 'number', 'currency', 'date', 'replace'].includes(fmt.filter) && (
                <input
                  className={inputClass}
                  value={fmt.arg}
                  onChange={e => setFmt({ ...fmt, arg: e.target.value })}
                  placeholder={{ default: 'text', truncate: '40', number: '2', currency: 'USD', date: 'DD MMM YYYY', replace: 'old' }[fmt.filter]}
                />
              )}
              <Button
                variant="primary"
                className="w-full"
                onMouseDown={e => e.preventDefault()}
                onClick={() => insert(`{{${fmt.field} | ${fmt.filter}${fmt.arg ? `:${/^[\w.-]+$/.test(fmt.arg) ? fmt.arg : quote(fmt.arg)}` : ''}}}`)}
              >
                Insert field
              </Button>
            </div>
          )}

          {tool === 'fill' && (
            <div className="mt-4 space-y-2 animate-fade-up">
              <Label hint="(answered once, used in every record)">Prompt</Label>
              <input className={inputClass} value={fill} onChange={e => setFill(e.target.value)} placeholder="e.g. Meeting week" />
              <Button variant="primary" className="w-full" disabled={!fill.trim()} onMouseDown={e => e.preventDefault()} onClick={() => insert(`{{fill:${fill.trim()}}}`)}>
                Insert fill-in
              </Button>
            </div>
          )}

          {help && (
            <div className="mt-4 rounded-xl bg-navy text-white/85 p-3 text-[11px] space-y-1.5 font-mono animate-fade-up overflow-x-auto scroll-thin">
              <p>{'{{First Name}}'}</p>
              <p>{'{{First Name | default:"there"}}'}</p>
              <p>{'{{Full Name | first | title}}'}</p>
              <p>{'{{Ticket | currency:USD}}'}</p>
              <p>{'{{Last Met | date:"D MMM YYYY"}}'}</p>
              <p>{'{{#if Sector = "Fintech"}}...{{else if Stage contains Seed}}...{{else}}...{{/if}}'}</p>
              <p>{'{{#if [Warm Intro] is not empty and Ticket >= 1000000}}...{{/if}}'}</p>
              <p>{'{{@record}} {{@sequence}} {{@date}} {{fill:Prompt}}'}</p>
              <p className="font-sans text-white/55 pt-1">
                Operators: = != &lt;&gt; &gt; &lt; &gt;= &lt;=, contains, does not contain, starts with, ends with, is empty, is not empty. = accepts * and ? wildcards. Field names with spaces can be written in [brackets].
              </p>
            </div>
          )}
        </Panel>

        <label className="flex items-start gap-3 bg-white border border-line rounded-2xl shadow-card px-4 py-3 text-sm text-navy cursor-pointer">
          <Switch checked={settings.skipDuplicates} onChange={skipDuplicates => onSettings({ skipDuplicates })} />
          <span>
            <span className="block font-semibold">One email per address</span>
            <span className="block text-xs text-navy/50">Merge only the first record for each email address</span>
          </span>
        </label>
      </aside>
    </div>
  )
}
