/** A data source row: column header -> cell text. */
export type Row = Record<string, string>

/** How a field name is matched to a column: case, spacing, underscores and [brackets] are ignored. */
export function fieldKey(name: string): string {
  return name
    .trim()
    .replace(/^\[(.*)\]$/, '$1')
    .toLowerCase()
    .replace(/[\s_]+/g, ' ')
    .trim()
}

const indexes = new WeakMap<Row, Map<string, string>>()

/** Cell value for a field name, or undefined when the row has no such column. */
export function lookup(row: Row, name: string): string | undefined {
  let index = indexes.get(row)
  if (!index) {
    index = new Map()
    for (const [k, v] of Object.entries(row)) {
      const key = fieldKey(k)
      if (!index.has(key)) index.set(key, v ?? '')
    }
    indexes.set(row, index)
  }
  return index.get(fieldKey(name))
}

/** True when the header list has a column for this field name. */
export function hasColumn(headers: string[], name: string): boolean {
  const key = fieldKey(name)
  return headers.some(h => fieldKey(h) === key)
}
