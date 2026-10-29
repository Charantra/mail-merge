/**
 * Apply numbered migrations: node --env-file=.env.local scripts/migrate.mjs
 * On Render: DATABASE_URL is already in the environment.
 *
 * Each file in scripts/migrations/NNNN_name.sql runs once, in order, inside its own
 * transaction, and is recorded in schema_migrations. A failed file rolls back and
 * stops the run, so later migrations never apply on top of a half-applied one.
 * An applied file whose contents later change is reported, not re-run: write a new
 * migration instead of editing an old one.
 */
import { readFileSync, readdirSync } from 'fs'
import { createHash } from 'crypto'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const { Pool } = pg
const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, 'migrations')
const FILE_RE = /^(\d{4})_[a-z0-9_]+\.sql$/

async function migrate() {
  const url = process.env.DATABASE_URL?.trim()
  if (!url) {
    console.error('DATABASE_URL is not set.')
    process.exit(1)
  }

  const host = (() => {
    try {
      return new URL(url).hostname
    } catch {
      return ''
    }
  })()
  // TLS is unchanged from before. Render's internal URL uses self-signed
  // certificates, so verification cannot be switched on without breaking it.
  // See docs/architecture.md, "Database TLS".
  const ssl =
    url.includes('sslmode=disable') || host === 'localhost' || host === '127.0.0.1'
      ? false
      : { rejectUnauthorized: false }

  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => FILE_RE.test(f))
    .sort()

  const versions = files.map(f => f.slice(0, 4))
  const dup = versions.find((v, i) => versions.indexOf(v) !== i)
  if (dup) {
    console.error(`Two migration files share version ${dup}. Renumber one.`)
    process.exit(1)
  }

  const pool = new Pool({ connectionString: url, ssl })
  const client = await pool.connect()
  // Migrations report what they could not do (for example unmapped ids) as notices.
  client.on('notice', n => console.log(`  notice: ${n.message}`))
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        checksum   TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`)

    const applied = new Map(
      (await client.query('SELECT version, checksum FROM schema_migrations')).rows.map(r => [
        r.version,
        r.checksum,
      ]),
    )

    let ran = 0
    for (const file of files) {
      const version = file.slice(0, 4)
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8')
      const checksum = createHash('sha256').update(sql).digest('hex')

      if (applied.has(version)) {
        if (applied.get(version) !== checksum) {
          console.warn(
            `Warning: ${file} changed after it was applied. It will not re-run. Put the change in a new migration.`,
          )
        }
        continue
      }

      // A concurrent deploy may run migrate at the same time; the advisory lock
      // makes the second runner wait, then skip what the first applied.
      await client.query('BEGIN')
      try {
        await client.query('SELECT pg_advisory_xact_lock(727274)')
        const already = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [
          version,
        ])
        if (already.rowCount) {
          await client.query('COMMIT')
          continue
        }
        await client.query(sql)
        await client.query(
          'INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)',
          [version, file, checksum],
        )
        await client.query('COMMIT')
        console.log(`Applied ${file}`)
        ran++
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {})
        throw new Error(`${file} failed and was rolled back: ${err.message}`)
      }
    }

    console.log(ran ? `Migration complete (${ran} applied).` : 'Migration complete (nothing to apply).')
  } finally {
    client.release()
    await pool.end()
  }
}

migrate().catch(err => {
  console.error('Migration failed:', err.message || err)
  process.exit(1)
})
