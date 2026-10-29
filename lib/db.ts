import { Pool } from 'pg'

let pool: Pool | null = null

function useSsl(url: string): false | { rejectUnauthorized: false } {
  if (url.includes('sslmode=disable')) return false
  try {
    const host = new URL(url).hostname
    if (host === 'localhost' || host === '127.0.0.1') return false
  } catch {
    /* ignore parse errors */
  }
  return { rejectUnauthorized: false }
}

export function getPool(): Pool {
  if (pool) return pool
  const url = process.env.DATABASE_URL?.trim()
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Add it to .env.local (local Postgres) or to the Render environment dashboard.',
    )
  }
  pool = new Pool({
    connectionString: url,
    ssl: useSsl(url),
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  })
  return pool
}

export async function query<T extends object = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const client = getPool()
  const result = await client.query<T>(sql, params)
  return result.rows
}

export async function queryOne<T extends object = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}
