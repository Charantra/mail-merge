'use client'

import { useMemo, useState } from 'react'
import { OPERATORS, isUnary, isValidEmail, splitAddresses, type Dataset, type FilterRule, type Row, type SortKey } from '../core'
import { Badge, Button, Label, Panel, inputClass } from './kit'

const SHOW = 500

export function RecipientsStep({
  dataset,
  onRows,
  toColumn,
  onToColumn,
  excluded,
  onExcluded,
  rules,
  onRules,
  sorts,
  onSorts,
  order,
  duplicates,
}: {
  dataset: Dataset
  onRows: (rows: Row[]) => void
  toColumn: string
  onToColumn: (c: string) => void
  excluded: Set<number>
  onExcluded: (s: Set<number>) => void
  rules: FilterRule[]
  onRules: (r: FilterRule[]) => void
  sorts: SortKey[]
  onSorts: (s: SortKey[]) => void
  /** Rows passing the filter, in sort order (ticked or not). */
  order: number[]
  duplicates: Set<number>
}) {
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<{ row: number; field: string } | null>(null)
  const [showFilter, setShowFilter] = useState(rules.length > 0 || sorts.length > 0)

  const passing = useMemo(() => new Set(order), [order])
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const inOrder = [...order, ...dataset.rows.map((_, i) => i).filter(i => !passing.has(i))]
    return q ? inOrder.filter(i => dataset.headers.some(h => (dataset.rows[i][h] ?? '').toLowerCase().includes(q))) : inOrder
  }, [order, passing, dataset, search])

  const invalid = (i: number) => {
    const a = splitAddresses(dataset.rows[i][toColumn] ?? '')
    return !a.length || a.some(x => !isValidEmail(x))
  }
  const selected = order.filter(i => !excluded.has(i)).length

  function setAll(on: boolean, which: number[]) {
    const next = new Set(excluded)
    for (const i of which) on ? next.delete(i) : next.add(i)
    onExcluded(next)
  }

  function editCell(row: number, field: string, value: string) {
    const rows = dataset.rows.slice()
    rows[row] = { ...rows[row], [field]: value }
    onRows(rows)
  }

  function addRecipient() {
    const row: Row = {}
    for (const h of dataset.headers) row[h] = ''
    onRows([...dataset.rows, row])
    setEditing({ row: dataset.rows.length, field: dataset.headers[0] })
  }

  const rule = (i: number, patch: Partial<FilterRule>) => onRules(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const sortAt = (i: number, patch: Partial<SortKey>) => onSorts(sorts.map((s, j) => (j === i ? { ...s, ...patch } : s)))

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-end gap-4">
          <label className="block min-w-[220px]">
            <Label hint="(Match Fields: which column holds the address)">Email column</Label>
            <select className={inputClass} value={toColumn} onChange={e => onToColumn(e.target.value)}>
              <option value="">Choose...</option>
              {dataset.headers.map(h => (
                <option key={h}>{h}</option>
              ))}
            </select>
          </label>
          <label className="block flex-1 min-w-[200px]">
            <Label>Find recipient</Label>
            <input className={inputClass} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search any field" />
          </label>
          <div className="flex gap-2">
            <Button onClick={() => setShowFilter(v => !v)}>{showFilter ? 'Hide filter and sort' : 'Filter and sort...'}</Button>
            <Button onClick={() => setAll(false, order.filter(invalid))} disabled={!toColumn}>
              Untick invalid addresses
            </Button>
            <Button onClick={addRecipient}>Add recipient</Button>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          <strong className="text-slate-900">{selected}</strong> of {dataset.rows.length} records will be merged
          {order.length < dataset.rows.length && <> · {dataset.rows.length - order.length} filtered out</>}
          {duplicates.size > 0 && <> · {duplicates.size} duplicate address{duplicates.size === 1 ? '' : 'es'}</>}
        </p>
      </Panel>

      {showFilter && (
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <Panel
            title="Filter records"
            actions={
              <Button variant="ghost" onClick={() => onRules([...rules, { join: 'and', field: dataset.headers[0] ?? '', op: 'eq', value: '' }])}>
                + Add condition
              </Button>
            }
          >
            {!rules.length && <p className="text-sm text-slate-500">No filter. Every record is included.</p>}
            <div className="space-y-2">
              {rules.map((r, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  {i === 0 ? (
                    <span className="w-16 text-xs text-slate-500">Where</span>
                  ) : (
                    <select className={`${inputClass} w-16`} value={r.join} onChange={e => rule(i, { join: e.target.value as 'and' | 'or' })}>
                      <option value="and">And</option>
                      <option value="or">Or</option>
                    </select>
                  )}
                  <select className={`${inputClass} w-44`} value={r.field} onChange={e => rule(i, { field: e.target.value })}>
                    {dataset.headers.map(h => (
                      <option key={h}>{h}</option>
                    ))}
                  </select>
                  <select className={`${inputClass} w-48`} value={r.op} onChange={e => rule(i, { op: e.target.value as FilterRule['op'] })}>
                    {OPERATORS.map(o => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {!isUnary(r.op) && (
                    <input className={`${inputClass} flex-1 min-w-[120px]`} value={r.value} onChange={e => rule(i, { value: e.target.value })} placeholder="Compare to (* and ? wildcards)" />
                  )}
                  <Button variant="ghost" onClick={() => onRules(rules.filter((_, j) => j !== i))} aria-label="Remove condition">
                    ×
                  </Button>
                </div>
              ))}
            </div>
          </Panel>
          <Panel
            title="Sort records"
            actions={
              sorts.length < 3 && (
                <Button variant="ghost" onClick={() => onSorts([...sorts, { field: dataset.headers[0] ?? '', dir: 'asc' }])}>
                  + Add sort
                </Button>
              )
            }
          >
            {!sorts.length && <p className="text-sm text-slate-500">Data source order.</p>}
            <div className="space-y-2">
              {sorts.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-12 text-xs text-slate-500">{i === 0 ? 'Sort by' : 'Then by'}</span>
                  <select className={`${inputClass} flex-1`} value={s.field} onChange={e => sortAt(i, { field: e.target.value })}>
                    {dataset.headers.map(h => (
                      <option key={h}>{h}</option>
                    ))}
                  </select>
                  <select className={`${inputClass} w-28`} value={s.dir} onChange={e => sortAt(i, { dir: e.target.value as 'asc' | 'desc' })}>
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                  <Button variant="ghost" onClick={() => onSorts(sorts.filter((_, j) => j !== i))} aria-label="Remove sort">
                    ×
                  </Button>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      <div className="bg-white border border-slate-200 overflow-auto max-h-[60vh]">
        <table className="text-sm w-full">
          <thead className="bg-slate-50 sticky top-0 z-10">
            <tr>
              <th className="px-2 py-2 w-8">
                <input
                  type="checkbox"
                  aria-label="Tick all shown"
                  checked={visible.length > 0 && visible.every(i => !excluded.has(i))}
                  onChange={e => setAll(e.target.checked, visible)}
                />
              </th>
              <th className="px-2 py-2 text-left text-xs font-semibold text-slate-500">#</th>
              {dataset.headers.map(h => (
                <th key={h} className={`px-2 py-2 text-left text-xs font-semibold whitespace-nowrap ${h === toColumn ? 'text-orange-700' : 'text-slate-700'}`}>
                  {h}
                </th>
              ))}
              <th className="px-2 py-2 text-left text-xs font-semibold text-slate-500">Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.slice(0, SHOW).map(i => {
              const row = dataset.rows[i]
              const out = !passing.has(i)
              return (
                <tr key={i} className={`border-t border-slate-100 ${out || excluded.has(i) ? 'opacity-50' : ''}`}>
                  <td className="px-2 py-1">
                    <input
                      type="checkbox"
                      aria-label={`Include record ${i + 1}`}
                      checked={!excluded.has(i)}
                      onChange={e => setAll(e.target.checked, [i])}
                    />
                  </td>
                  <td className="px-2 py-1 text-xs text-slate-400">{i + 1}</td>
                  {dataset.headers.map(h => (
                    <td key={h} className="px-2 py-1 whitespace-nowrap max-w-[240px]" onClick={() => setEditing({ row: i, field: h })}>
                      {editing?.row === i && editing.field === h ? (
                        <input
                          autoFocus
                          className={`${inputClass} py-0.5 min-w-[140px]`}
                          defaultValue={row[h] ?? ''}
                          onBlur={e => {
                            editCell(i, h, e.target.value.trim())
                            setEditing(null)
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                            if (e.key === 'Escape') setEditing(null)
                          }}
                        />
                      ) : (
                        <span className="block truncate cursor-text text-slate-800" title="Click to edit">
                          {row[h] || <span className="text-slate-300">-</span>}
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="px-2 py-1 space-x-1">
                    {out && <Badge>Filtered out</Badge>}
                    {toColumn && invalid(i) && <Badge tone="red">{row[toColumn] ? 'Invalid email' : 'No email'}</Badge>}
                    {duplicates.has(i) && <Badge tone="amber">Duplicate</Badge>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {visible.length > SHOW && (
          <p className="px-3 py-2 text-xs text-slate-500 border-t border-slate-100">
            Showing {SHOW} of {visible.length}. Search to find others; all ticked records are merged.
          </p>
        )}
        {!visible.length && <p className="px-3 py-6 text-sm text-slate-500 text-center">No records match.</p>}
      </div>
    </div>
  )
}
