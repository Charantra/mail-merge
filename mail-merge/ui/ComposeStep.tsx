'use client'

import { useRef, useState } from 'react'
import { FILTERS, OPERATORS, isUnary, type Attachment, type Compiled, type MergeSettings, type Op } from '../core'
import { Badge, Button, Label, Panel, inputClass } from './kit'

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
}: {
  settings: MergeSettings
  onSettings: (patch: Partial<MergeSettings>) => void
  headers: string[]
  compiled: Compiled
  files: MergeFile[]
  onFiles: (f: MergeFile[]) => void
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
  const ring = (t: Target) => (target === t ? 'ring-1 ring-orange-300' : '')
  const totalMb = files.reduce((n, f) => n + f.bytes.length, 0) / 1048576

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <Panel>
          <div className="grid gap-3">
            <div className="grid sm:grid-cols-[80px_1fr] items-center gap-2">
              <span className="text-sm text-slate-500">To</span>
              <span className="text-sm text-slate-800">
                {settings.toColumn ? <Badge>{`{{${settings.toColumn}}}`}</Badge> : <Badge tone="red">Choose the email column on the Recipients step</Badge>}
              </span>
              <span className="text-sm text-slate-500">CC</span>
              <input ref={refs.cc} onFocus={focus('cc')} className={`${inputClass} ${ring('cc')}`} value={settings.cc} onChange={e => onSettings({ cc: e.target.value })} placeholder="Optional. A fixed address or a field" />
              <span className="text-sm text-slate-500">BCC</span>
              <input ref={refs.bcc} onFocus={focus('bcc')} className={`${inputClass} ${ring('bcc')}`} value={settings.bcc} onChange={e => onSettings({ bcc: e.target.value })} placeholder="Optional" />
              <span className="text-sm text-slate-500">Subject</span>
              <input ref={refs.subject} onFocus={focus('subject')} className={`${inputClass} ${ring('subject')}`} value={settings.subject} onChange={e => onSettings({ subject: e.target.value })} placeholder="e.g. {{Company}} x Charantra" />
            </div>
          </div>
        </Panel>

        <Panel
          title="Message"
          actions={
            <div className="flex border border-slate-300 text-xs">
              {(['text', 'html'] as const).map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => onSettings({ format: f })}
                  className={`px-2.5 py-1 ${settings.format === f ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
                >
                  {f === 'text' ? 'Plain text' : 'HTML'}
                </button>
              ))}
            </div>
          }
        >
          <textarea
            ref={refs.body}
            onFocus={focus('body')}
            value={settings.body}
            onChange={e => onSettings({ body: e.target.value })}
            rows={18}
            spellCheck
            placeholder={'Dear {{First Name | default:"Sir or Madam"}},\n\nI am writing about {{Company}}...'}
            className={`${inputClass} font-mono text-[13px] leading-relaxed ${ring('body')}`}
          />
          {settings.format === 'html' && (
            <p className="text-xs text-slate-500 mt-1">HTML body. Merged values are escaped, so data cannot inject markup.</p>
          )}
        </Panel>

        {(compiled.errors.length > 0 || compiled.unknownFields.length > 0) && (
          <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 space-y-1">
            {compiled.errors.map(e => (
              <p key={e}>{e}</p>
            ))}
            {compiled.unknownFields.length > 0 && (
              <p>
                Not a column in the data source: {compiled.unknownFields.map(f => `{{${f}}}`).join(', ')}. These merge as blank.
              </p>
            )}
          </div>
        )}

        {compiled.fills.length > 0 && (
          <Panel title="Fill-in answers" actions={<span className="text-xs text-slate-500">Used for every record</span>}>
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

        <Panel title="Attachments">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Same files for everyone</Label>
              <Button onClick={() => sharedRef.current?.click()}>Add files...</Button>
              <input ref={sharedRef} type="file" multiple className="hidden" onChange={e => { void addFiles(e.target.files, true); e.target.value = '' }} />
            </div>
            <div>
              <Label hint="(file names listed in a column, separated by ;)">Per-record files</Label>
              <div className="flex gap-2">
                <select className={inputClass} value={settings.attachmentColumn} onChange={e => onSettings({ attachmentColumn: e.target.value })}>
                  <option value="">No attachment column</option>
                  {headers.map(h => (
                    <option key={h}>{h}</option>
                  ))}
                </select>
                <Button onClick={() => poolRef.current?.click()} disabled={!settings.attachmentColumn}>
                  Add...
                </Button>
                <input ref={poolRef} type="file" multiple className="hidden" onChange={e => { void addFiles(e.target.files, false); e.target.value = '' }} />
              </div>
            </div>
          </div>
          {files.length > 0 && (
            <ul className="mt-3 divide-y divide-slate-100 border border-slate-200 text-sm">
              {files.map(f => (
                <li key={f.name} className="flex items-center justify-between px-3 py-1.5">
                  <span className="truncate">
                    {f.name} <span className="text-xs text-slate-400">{(f.bytes.length / 1024).toFixed(0)} KB</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone={f.shared ? 'green' : 'slate'}>{f.shared ? 'Everyone' : 'When named in column'}</Badge>
                    <button type="button" className="text-slate-400 hover:text-red-600" aria-label={`Remove ${f.name}`} onClick={() => onFiles(files.filter(x => x !== f))}>
                      ×
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {totalMb > 20 && <p className="mt-2 text-xs text-amber-700">{totalMb.toFixed(1)} MB in total. Most mail servers reject messages over 20 to 25 MB.</p>}
        </Panel>
      </div>

      <aside className="space-y-4">
        <Panel title="Insert merge field" actions={<span className="text-xs text-slate-500">into {target}</span>}>
          <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto">
            {headers.map(h => (
              <button
                key={h}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => insert(`{{${h}}}`)}
                className="px-2 py-1 text-xs border border-slate-300 bg-slate-50 hover:bg-orange-50 hover:border-orange-300 text-slate-700"
              >
                {h}
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Rules and blocks">
          <div className="grid grid-cols-2 gap-1.5">
            <Button onClick={() => setTool(tool === 'greeting' ? null : 'greeting')}>Greeting line</Button>
            <Button onClick={() => setTool(tool === 'if' ? null : 'if')}>If...Then...Else</Button>
            <Button onClick={() => setTool(tool === 'format' ? null : 'format')}>Formatted field</Button>
            <Button onClick={() => setTool(tool === 'fill' ? null : 'fill')}>Fill-in</Button>
            <Button onMouseDown={e => e.preventDefault()} onClick={() => insert('{{@record}}')}>Merge Record #</Button>
            <Button onMouseDown={e => e.preventDefault()} onClick={() => insert('{{@sequence}}')}>Merge Sequence #</Button>
            <Button onMouseDown={e => e.preventDefault()} onClick={() => insert('{{@date}}')}>Today&apos;s date</Button>
            <Button onClick={() => setHelp(h => !h)}>{help ? 'Hide syntax' : 'Syntax help'}</Button>
          </div>

          {tool === 'greeting' && (
            <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
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
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={greet.filter === 'first'} onChange={e => setGreet({ ...greet, filter: e.target.checked ? 'first' : '' })} />
                Use only the first word (first name from a full name)
              </label>
              <label className="block">
                <Label>When the name is blank</Label>
                <input className={inputClass} value={greet.fallback} onChange={e => setGreet({ ...greet, fallback: e.target.value })} />
              </label>
              <Button
                variant="primary"
                onMouseDown={e => e.preventDefault()}
                onClick={() => insert(`${greet.word} {{${greet.field}${greet.filter ? ' | first' : ''} | default:${quote(greet.fallback)}}}${greet.end}`)}
              >
                Insert greeting
              </Button>
            </div>
          )}

          {tool === 'if' && (
            <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
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
            <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
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
                onMouseDown={e => e.preventDefault()}
                onClick={() => insert(`{{${fmt.field} | ${fmt.filter}${fmt.arg ? `:${/^[\w.-]+$/.test(fmt.arg) ? fmt.arg : quote(fmt.arg)}` : ''}}}`)}
              >
                Insert field
              </Button>
            </div>
          )}

          {tool === 'fill' && (
            <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
              <Label hint="(answered once, used in every record)">Prompt</Label>
              <input className={inputClass} value={fill} onChange={e => setFill(e.target.value)} placeholder="e.g. Meeting week" />
              <Button variant="primary" disabled={!fill.trim()} onMouseDown={e => e.preventDefault()} onClick={() => insert(`{{fill:${fill.trim()}}}`)}>
                Insert fill-in
              </Button>
            </div>
          )}

          {help && (
            <div className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-600 space-y-1.5 font-mono">
              <p>{'{{First Name}}'}</p>
              <p>{'{{First Name | default:"there"}}'}</p>
              <p>{'{{Full Name | first | title}}'}</p>
              <p>{'{{Ticket | currency:USD}}'}</p>
              <p>{'{{Last Met | date:"D MMM YYYY"}}'}</p>
              <p>{'{{#if Sector = "Fintech"}}...{{else if Stage contains Seed}}...{{else}}...{{/if}}'}</p>
              <p>{'{{#if [Warm Intro] is not empty and Ticket >= 1000000}}...{{/if}}'}</p>
              <p>{'{{@record}} {{@sequence}} {{@date}} {{fill:Prompt}}'}</p>
              <p className="font-sans text-slate-500">
                Operators: = != &lt;&gt; &gt; &lt; &gt;= &lt;=, contains, does not contain, starts with, ends with, is empty, is not empty. = accepts * and ? wildcards. Field names with spaces can be written in [brackets].
              </p>
            </div>
          )}
        </Panel>

        <label className="flex items-start gap-2 text-sm text-slate-700 px-1">
          <input type="checkbox" className="mt-1" checked={settings.skipDuplicates} onChange={e => onSettings({ skipDuplicates: e.target.checked })} />
          Merge only the first record for each email address
        </label>
      </aside>
    </div>
  )
}
