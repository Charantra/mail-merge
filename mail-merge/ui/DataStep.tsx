'use client'

import { useRef, useState } from 'react'
import { parseDelimited, readWorkbook, type Dataset, type Workbook } from '../core'
import { Badge, Button, Icon, Notice, Panel, Segmented, Switch, inputClass } from './kit'

export interface Source {
  name: string
  workbook?: Workbook
  sheet?: string
  matrix: string[][]
  headerRow: boolean
}

const SAMPLE = `First Name,Last Name,Email,Company,Sector,Stage,Ticket Size USD,Last Met
Asha,Rao,asha.rao@example.com,Northbridge Capital,Fintech,Series A,2500000,2026-08-14
Vikram,Shah,vikram@example.com,Lotus Ventures,SaaS,Seed,750000,
Meera,Iyer,meera.iyer@example.com,Peak XV Partners,Fintech,Series B,10000000,2026-09-02
Daniel,Okafor,daniel@example,Harbor Growth,Healthcare,Series A,4000000,
,Chen,l.chen@example.com,Orbit Fund,SaaS,Series A,3000000,2026-07-21
Asha,Rao,asha.rao@example.com,Northbridge Capital,Fintech,Series A,2500000,2026-08-14`

export function DataStep({
  source,
  dataset,
  onSource,
}: {
  source: Source | null
  dataset: Dataset
  onSource: (s: Source | null) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [paste, setPaste] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  async function load(file: File) {
    setError(null)
    try {
      if (/\.(csv|tsv|txt)$/i.test(file.name)) {
        onSource({ name: file.name, matrix: parseDelimited(await file.text()), headerRow: true })
        return
      }
      const workbook = readWorkbook(new Uint8Array(await file.arrayBuffer()))
      const sheet = workbook.sheets[0]
      if (!sheet) throw new Error('The workbook has no sheets')
      onSource({ name: file.name, workbook, sheet, matrix: workbook.matrix(sheet), headerRow: true })
    } catch (e) {
      setError(`Could not read ${file.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  function takePasted(text: string, name: string) {
    const matrix = parseDelimited(text)
    if (!matrix.length) {
      setError('Nothing to read in the pasted text')
      return
    }
    setError(null)
    onSource({ name, matrix, headerRow: true })
  }

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept=".xlsx,.xls,.xlsm,.ods,.csv,.tsv,.txt"
      aria-label="Spreadsheet file"
      className="sr-only"
      onChange={e => {
        const f = e.target.files?.[0]
        if (f) void load(f)
        e.target.value = ''
      }}
    />
  )

  // How full each column is, so a half-empty column stands out before anyone writes with it.
  const filled = dataset.headers.map(h => ({
    name: h,
    count: dataset.rows.filter(r => (r[h] ?? '').trim()).length,
  }))

  return (
    <div className={`flex flex-col gap-4 w-full ${source ? '' : 'max-w-3xl'}`}>
      {fileInput}
      {!source && (
        <>
          <div
            onDragOver={e => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => {
              e.preventDefault()
              setDragging(false)
              const f = e.dataTransfer.files[0]
              if (f) void load(f)
            }}
            className={`relative flex flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 py-10 text-center transition-all duration-200 bg-dots ${
              dragging ? 'border-orange bg-orange-50 scale-[1.01] shadow-lift' : 'border-navy/15 bg-white hover:border-navy/25'
            }`}
          >
            <div className="relative mb-5 animate-float" aria-hidden="true">
              <div className="absolute inset-0 translate-x-3 -translate-y-2 rotate-6 rounded-2xl bg-orange-100" />
              <div className="relative grid h-16 w-16 place-items-center rounded-2xl bg-white border border-line shadow-lift text-orange">
                <Icon name={dragging ? 'download' : 'sheet'} size={30} strokeWidth={1.5} />
              </div>
            </div>
            <p className="text-2xl font-bold text-navy tracking-tight">{dragging ? 'Let go to load it' : 'Drop your spreadsheet here'}</p>
            <p className="text-[15px] text-navy/55 mt-2 max-w-md">The first row is the column names. The file is read in this browser and never uploaded.</p>
            <Button variant="primary" size="lg" className="mt-6" onClick={() => fileRef.current?.click()}>
              <Icon name="upload" size={17} />
              Choose a file
            </Button>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5">
              {['XLSX', 'XLS', 'CSV', 'TSV', 'ODS'].map(t => (
                <span key={t} className="px-2 py-0.5 rounded-md bg-navy/[0.05] text-[11px] font-bold tracking-wide text-navy/50">
                  {t}
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setShowPaste(v => !v)}
              aria-expanded={showPaste}
              className={`group flex items-center gap-4 text-left bg-white border rounded-2xl p-4 shadow-card transition-all hover:shadow-lift hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange ${
                showPaste ? 'border-orange ring-4 ring-orange/10' : 'border-line'
              }`}
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-600">
                <Icon name="clipboard" size={20} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-navy">Paste rows</span>
                <span className="block text-xs text-navy/55 mt-0.5">Copy cells from Excel or Google Sheets</span>
              </span>
              <Icon name="chevron-right" size={18} className={`text-navy/30 transition-transform ${showPaste ? 'rotate-90' : 'group-hover:translate-x-0.5'}`} />
            </button>
            <button
              type="button"
              onClick={() => takePasted(SAMPLE, 'Sample data')}
              className="group flex items-center gap-4 text-left bg-white border border-line rounded-2xl p-4 shadow-card transition-all hover:shadow-lift hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600">
                <Icon name="sparkles" size={20} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-navy">Try a sample list</span>
                <span className="block text-xs text-navy/55 mt-0.5">Six investors, with a few mistakes to catch</span>
              </span>
              <Icon name="chevron-right" size={18} className="text-navy/30 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>

          {showPaste && (
            <Panel title="Paste rows" icon="clipboard" subtitle="Tabs or commas between cells, one person per line" className="animate-fade-up">
              <textarea
                autoFocus
                value={paste}
                onChange={e => setPaste(e.target.value)}
                rows={7}
                placeholder={'Name\tEmail\tCompany\nAsha Rao\tasha@example.com\tNorthbridge'}
                className={`${inputClass} font-mono text-xs leading-relaxed`}
              />
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-navy/45">{paste.trim() ? `${paste.trim().split('\n').length} lines` : 'Nothing pasted yet'}</span>
                <Button variant="dark" disabled={!paste.trim()} onClick={() => takePasted(paste, 'Pasted list')}>
                  Use this list
                  <Icon name="arrow-right" size={15} />
                </Button>
              </div>
            </Panel>
          )}
        </>
      )}

      {error && <Notice tone="red">{error}</Notice>}

      {source && (
        <>
          <section className="bg-white border border-line rounded-2xl shadow-card p-4 sm:p-5 flex flex-wrap items-center gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-100">
              <Icon name="sheet" size={26} strokeWidth={1.6} />
            </span>
            <div className="flex-1 min-w-[12rem]">
              <p className="text-base font-bold text-navy truncate">{source.name}</p>
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                <Badge tone="green" dot>
                  {dataset.rows.length} record{dataset.rows.length === 1 ? '' : 's'}
                </Badge>
                <Badge>{dataset.headers.length} columns</Badge>
                {source.sheet && <Badge>Sheet: {source.sheet}</Badge>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => fileRef.current?.click()}>
                <Icon name="refresh" size={15} />
                Replace
              </Button>
              <Button variant="ghost" onClick={() => onSource(null)} aria-label="Remove the list">
                <Icon name="trash" size={15} />
                Remove
              </Button>
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {source.workbook && source.workbook.sheets.length > 1 && (
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-semibold text-navy/50">Sheet</span>
                {source.workbook.sheets.length <= 5 ? (
                  <Segmented
                    size="sm"
                    value={source.sheet ?? ''}
                    options={source.workbook.sheets.map(s => ({ value: s, label: s }))}
                    onChange={sheet => onSource({ ...source, sheet, matrix: source.workbook!.matrix(sheet) })}
                  />
                ) : (
                  <select
                    className={`${inputClass} w-auto`}
                    value={source.sheet}
                    onChange={e => onSource({ ...source, sheet: e.target.value, matrix: source.workbook!.matrix(e.target.value) })}
                  >
                    {source.workbook.sheets.map(s => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                )}
              </div>
            )}
            <label className="flex items-center gap-2.5 text-sm text-navy cursor-pointer select-none">
              <Switch checked={source.headerRow} onChange={headerRow => onSource({ ...source, headerRow })} />
              First row holds the column names
            </label>
          </div>

          <Panel title="Columns" icon="layers" subtitle="How many records have a value in each" bodyClassName="p-4">
            <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
              {filled.map(c => {
                const share = dataset.rows.length ? c.count / dataset.rows.length : 0
                return (
                  <div key={c.name} className="rounded-xl border border-line bg-canvas/60 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold text-navy truncate" title={c.name}>
                        {c.name}
                      </span>
                      <span className={`text-[11px] font-bold tabular-nums ${share === 1 ? 'text-emerald-600' : share >= 0.6 ? 'text-amber-600' : 'text-red-600'}`}>
                        {Math.round(share * 100)}%
                      </span>
                    </div>
                    <div className="mt-2 h-1 rounded-full bg-navy/[0.07] overflow-hidden" aria-hidden="true">
                      <div
                        className={`h-full rounded-full ${share === 1 ? 'bg-emerald-500' : share >= 0.6 ? 'bg-amber-400' : 'bg-red-400'}`}
                        style={{ width: `${share * 100}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </Panel>

          <Panel
            title="Preview"
            icon="table"
            subtitle={dataset.rows.length > PREVIEW ? `First ${PREVIEW} of ${dataset.rows.length} records` : `All ${dataset.rows.length} records`}
            bodyClassName=""
          >
            <div className="overflow-x-auto scroll-thin">
              <table className="text-[13px] w-full">
                <thead>
                  <tr className="bg-canvas/70">
                    <th className="px-3 py-2 text-left text-[11px] font-semibold text-navy/35 w-10">#</th>
                    {dataset.headers.map(h => (
                      <th key={h} className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-navy/55 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dataset.rows.slice(0, PREVIEW).map((r, i) => (
                    <tr key={i} className="border-t border-line hover:bg-orange-50/40 transition-colors">
                      <td className="px-3 py-2 text-[11px] text-navy/30 tabular-nums">{i + 1}</td>
                      {dataset.headers.map(h => (
                        <td key={h} className="px-3 py-2 text-navy/80 whitespace-nowrap max-w-[240px] truncate">
                          {r[h] || <span className="text-navy/20">empty</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  )
}

const PREVIEW = 8
