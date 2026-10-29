'use client'

import { useRef, useState } from 'react'
import { parseDelimited, readWorkbook, type Dataset, type Workbook } from '../core'
import { Button, Label, Panel, inputClass } from './kit'

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

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Use an existing list">
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
          className={`border-2 border-dashed px-4 py-10 text-center transition-colors ${dragging ? 'border-orange-400 bg-orange-50' : 'border-slate-300'}`}
        >
          <p className="text-sm text-slate-700">Drop an Excel or CSV file here</p>
          <p className="text-xs text-slate-500 mt-1">.xlsx, .xls, .ods, .csv, .tsv. The first row holds the column names.</p>
          <Button variant="primary" className="mt-4" onClick={() => fileRef.current?.click()}>
            Browse...
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.xlsm,.ods,.csv,.tsv,.txt"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) void load(f)
              e.target.value = ''
            }}
          />
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span>Files are read in your browser. Nothing is uploaded.</span>
          <button type="button" className="underline hover:text-slate-700" onClick={() => takePasted(SAMPLE, 'Sample data')}>
            Try with sample data
          </button>
        </div>
      </Panel>

      <Panel title="Type or paste a new list">
        <Label hint="(copy cells from Excel or Google Sheets, or type CSV)">Paste</Label>
        <textarea
          value={paste}
          onChange={e => setPaste(e.target.value)}
          rows={8}
          placeholder={'Name\tEmail\tCompany\nAsha Rao\tasha@example.com\tNorthbridge'}
          className={`${inputClass} font-mono text-xs`}
        />
        <Button className="mt-2" disabled={!paste.trim()} onClick={() => takePasted(paste, 'Pasted list')}>
          Use this list
        </Button>
      </Panel>

      {error && <p className="lg:col-span-2 text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2">{error}</p>}

      {source && (
        <Panel
          className="lg:col-span-2"
          title={
            <>
              {source.name}{' '}
              <span className="font-normal text-slate-500">
                · {dataset.rows.length} record{dataset.rows.length === 1 ? '' : 's'} · {dataset.headers.length} fields
              </span>
            </>
          }
          actions={
            <Button variant="ghost" onClick={() => onSource(null)}>
              Remove
            </Button>
          }
        >
          <div className="flex flex-wrap items-end gap-4 mb-3">
            {source.workbook && source.workbook.sheets.length > 1 && (
              <label className="block">
                <Label>Sheet</Label>
                <select
                  className={inputClass}
                  value={source.sheet}
                  onChange={e => onSource({ ...source, sheet: e.target.value, matrix: source.workbook!.matrix(e.target.value) })}
                >
                  {source.workbook.sheets.map(s => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex items-center gap-2 text-sm text-slate-700 pb-1.5">
              <input type="checkbox" checked={source.headerRow} onChange={e => onSource({ ...source, headerRow: e.target.checked })} />
              First row of data contains column headers
            </label>
          </div>
          <div className="overflow-x-auto border border-slate-200">
            <table className="text-xs w-full">
              <thead className="bg-slate-50">
                <tr>
                  {dataset.headers.map(h => (
                    <th key={h} className="px-2 py-1.5 text-left font-semibold text-slate-700 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataset.rows.slice(0, 5).map((r, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    {dataset.headers.map(h => (
                      <td key={h} className="px-2 py-1 text-slate-700 whitespace-nowrap max-w-[220px] truncate">
                        {r[h]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {dataset.rows.length > 5 && <p className="text-xs text-slate-500 mt-1">First 5 of {dataset.rows.length} records.</p>}
        </Panel>
      )}
    </div>
  )
}
