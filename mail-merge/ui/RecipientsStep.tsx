'use client'

import { useMemo, useState } from 'react'
import { OPERATORS, isUnary, isValidEmail, splitAddresses, type Dataset, type FilterRule, type Row, type SortKey } from '../core'
import { Badge, Button, Icon, Panel, Stat, inputClass } from './kit'

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

  const invalidCount = toColumn ? order.filter(invalid).length : 0
  const filteredOut = dataset.rows.length - order.length
  const firstValue = (h: string) => dataset.rows.find(r => (r[h] ?? '').trim())?.[h] ?? ''
  const looksLikeEmail = (h: string) => isValidEmail(splitAddresses(firstValue(h))[0] ?? '')

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-4">
      {!toColumn ? (
        <Panel title="Which column holds the email address?" icon="at" subtitle="Click the column with the addresses. You can change it later.">
          <div className="grid gap-2.5 grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
            {dataset.headers.map(h => {
              const email = looksLikeEmail(h)
              return (
                <button
                  key={h}
                  type="button"
                  onClick={() => onToColumn(h)}
                  className={`group text-left rounded-xl border px-3.5 py-3 transition-all hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange ${
                    email ? 'border-orange-300 bg-orange-50/60' : 'border-line bg-white hover:border-navy/20'
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-navy truncate">{h}</span>
                    {email && <Badge tone="orange">Looks right</Badge>}
                  </span>
                  <span className="block text-xs text-navy/50 mt-1 truncate">{firstValue(h) || 'empty'}</span>
                </button>
              )
            })}
          </div>
        </Panel>
      ) : (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Stat icon="users" tone="green" value={selected} label={`of ${dataset.rows.length} will be merged`} />
            <Stat icon="sliders" value={filteredOut} label="filtered out" />
            <Stat icon="copy" tone="amber" value={duplicates.size} label={`duplicate address${duplicates.size === 1 ? '' : 'es'}`} />
            <Stat icon="alert" tone="red" value={invalidCount} label="missing or invalid email" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy/35 pointer-events-none" />
              <input className={`${inputClass} pl-9 h-9`} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search any field" aria-label="Find recipient" />
            </div>
            <label className="flex items-center gap-2 h-9 pl-3 pr-1 rounded-lg border border-line bg-white shadow-card">
              <Icon name="at" size={14} className="text-orange-700" />
              <span className="text-xs font-semibold text-navy/50">Email column</span>
              <select className="bg-transparent text-sm font-semibold text-navy pr-1 py-1 focus:outline-none cursor-pointer" value={toColumn} onChange={e => onToColumn(e.target.value)}>
                <option value="">Choose...</option>
                {dataset.headers.map(h => (
                  <option key={h}>{h}</option>
                ))}
              </select>
            </label>
            <Button onClick={() => setShowFilter(v => !v)} className={showFilter ? '!border-orange !bg-orange-50' : ''}>
              <Icon name="sliders" size={15} />
              Filter and sort
              {rules.length + sorts.length > 0 && (
                <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-orange px-1 text-[11px] text-navy">{rules.length + sorts.length}</span>
              )}
            </Button>
            <Button onClick={() => setAll(false, order.filter(invalid))} disabled={!invalidCount}>
              <Icon name="x" size={15} />
              Untick invalid
            </Button>
            <Button variant="dark" onClick={addRecipient}>
              <Icon name="plus" size={15} />
              Add recipient
            </Button>
          </div>
        </>
      )}

      {showFilter && (
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr] animate-fade-up">
          <Panel
            title="Filter records"
            icon="sliders"
            actions={
              <Button size="sm" variant="ghost" onClick={() => onRules([...rules, { join: 'and', field: dataset.headers[0] ?? '', op: 'eq', value: '' }])}>
                <Icon name="plus" size={14} />
                Condition
              </Button>
            }
          >
            {!rules.length && <p className="text-sm text-navy/50">No filter. Every record is included.</p>}
            <div className="space-y-2">
              {rules.map((r, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 animate-fade-up">
                  {i === 0 ? (
                    <span className="w-16 text-xs font-semibold text-navy/50">Where</span>
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
                  <Button size="sm" variant="ghost" onClick={() => onRules(rules.filter((_, j) => j !== i))} aria-label="Remove condition">
                    <Icon name="x" size={14} />
                  </Button>
                </div>
              ))}
            </div>
          </Panel>
          <Panel
            title="Sort records"
            icon="layers"
            actions={
              sorts.length < 3 && (
                <Button size="sm" variant="ghost" onClick={() => onSorts([...sorts, { field: dataset.headers[0] ?? '', dir: 'asc' }])}>
                  <Icon name="plus" size={14} />
                  Sort
                </Button>
              )
            }
          >
            {!sorts.length && <p className="text-sm text-navy/50">Data source order.</p>}
            <div className="space-y-2">
              {sorts.map((s, i) => (
                <div key={i} className="flex items-center gap-2 animate-fade-up">
                  <span className="w-12 text-xs font-semibold text-navy/50">{i === 0 ? 'Sort by' : 'Then by'}</span>
                  <select className={`${inputClass} flex-1`} value={s.field} onChange={e => sortAt(i, { field: e.target.value })}>
                    {dataset.headers.map(h => (
                      <option key={h}>{h}</option>
                    ))}
                  </select>
                  <select className={`${inputClass} w-28`} value={s.dir} onChange={e => sortAt(i, { dir: e.target.value as 'asc' | 'desc' })}>
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                  <Button size="sm" variant="ghost" onClick={() => onSorts(sorts.filter((_, j) => j !== i))} aria-label="Remove sort">
                    <Icon name="x" size={14} />
                  </Button>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      <div className="bg-white border border-line rounded-2xl shadow-card overflow-auto scroll-thin flex-1 min-h-[16rem] max-h-[calc(100vh-22rem)]">
        <table className="text-[13px] w-full">
          <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur shadow-[0_1px_0_#e8e5dc]">
            <tr>
              <th className="pl-4 pr-2 py-2.5 w-8">
                <input
                  type="checkbox"
                  aria-label="Tick all shown"
                  checked={visible.length > 0 && visible.every(i => !excluded.has(i))}
                  onChange={e => setAll(e.target.checked, visible)}
                />
              </th>
              <th className="px-2 py-2.5 text-left text-[11px] font-semibold text-navy/35">#</th>
              {dataset.headers.map(h => (
                <th
                  key={h}
                  className={`px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide whitespace-nowrap ${h === toColumn ? 'text-orange-700' : 'text-navy/55'}`}
                >
                  <span className="inline-flex items-center gap-1">
                    {h === toColumn && <Icon name="at" size={12} />}
                    {h}
                  </span>
                </th>
              ))}
              <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-navy/55">Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.slice(0, SHOW).map(i => {
              const row = dataset.rows[i]
              const out = !passing.has(i)
              const off = out || excluded.has(i)
              return (
                <tr key={i} className={`group border-t border-line transition-colors ${off ? 'bg-canvas/50' : 'hover:bg-orange-50/40'}`}>
                  <td className="pl-4 pr-2 py-1.5">
                    <input
                      type="checkbox"
                      aria-label={`Include record ${i + 1}`}
                      checked={!excluded.has(i)}
                      onChange={e => setAll(e.target.checked, [i])}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-[11px] text-navy/30 tabular-nums">{i + 1}</td>
                  {dataset.headers.map(h => (
                    <td key={h} className={`px-3 py-1.5 whitespace-nowrap max-w-[240px] ${off ? 'opacity-45' : ''}`} onClick={() => setEditing({ row: i, field: h })}>
                      {editing?.row === i && editing.field === h ? (
                        <input
                          autoFocus
                          className={`${inputClass} py-1 min-w-[140px]`}
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
                        <span
                          className={`block truncate cursor-text rounded-md px-1.5 py-1 -mx-1.5 hover:bg-white hover:ring-1 hover:ring-line ${h === toColumn ? 'font-semibold text-navy' : 'text-navy/80'}`}
                          title="Click to edit"
                        >
                          {row[h] || <span className="text-navy/20">empty</span>}
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-1.5">
                    <span className="flex gap-1">
                      {out && <Badge dot>Filtered out</Badge>}
                      {toColumn && invalid(i) && (
                        <Badge tone="red" dot>
                          {row[toColumn] ? 'Invalid email' : 'No email'}
                        </Badge>
                      )}
                      {duplicates.has(i) && (
                        <Badge tone="amber" dot>
                          Duplicate
                        </Badge>
                      )}
                      {!out && !(toColumn && invalid(i)) && !duplicates.has(i) && !excluded.has(i) && (
                        <Badge tone="green" dot>
                          OK
                        </Badge>
                      )}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {visible.length > SHOW && (
          <p className="px-4 py-2.5 text-xs text-navy/50 border-t border-line">
            Showing {SHOW} of {visible.length}. Search to find others; all ticked records are merged.
          </p>
        )}
        {!visible.length && (
          <div className="px-4 py-12 text-center">
            <Icon name="search" size={24} className="mx-auto text-navy/25" />
            <p className="text-sm text-navy/55 mt-2">No records match.</p>
          </div>
        )}
      </div>
    </div>
  )
}
