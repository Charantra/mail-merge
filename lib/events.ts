/**
 * One event table (email_events) behind every count on every screen, plus the
 * guards that decide who may be emailed at all: suppression and the 14-day
 * cross-mandate cooldown. Server only.
 */
import { randomUUID } from 'crypto'
import { query } from './db'

export type EventType =
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'replied'
  | 'positive'
  | 'meeting'
  | 'negative'

export type EventSource = 'zepto' | 'graph' | 'tracking' | 'analyst'

export const COOLDOWN_DAYS = 14

/**
 * Record one event. `dedupeKey` names the real-world fact (for example
 * `zepto:delivered:<outreach id>`), so re-syncing the same log never counts twice.
 * Returns true when the event is new.
 */
export async function recordEvent(input: {
  sessionId: string
  outreachId: string
  followupId?: string | null
  type: EventType
  occurredAt: string | Date
  source: EventSource
  dedupeKey: string
  isMachine?: boolean
  detail?: Record<string, unknown>
  by?: string
}): Promise<boolean> {
  const at = input.occurredAt instanceof Date ? input.occurredAt : new Date(input.occurredAt)
  const occurred = Number.isFinite(at.getTime()) ? at : new Date()
  const rows = await query(
    `INSERT INTO email_events
       (id, session_id, outreach_id, followup_id, type, occurred_at, source, is_machine, detail, dedupe_key, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING id`,
    [
      randomUUID(),
      input.sessionId,
      input.outreachId,
      input.followupId ?? null,
      input.type,
      occurred.toISOString(),
      input.source,
      input.isMachine ?? false,
      JSON.stringify(input.detail ?? {}),
      input.dedupeKey,
      input.by ?? '',
    ],
  )
  return rows.length > 0
}

/** Remove an analyst-confirmed outcome (undo of a mis-click). Provider facts are never deleted. */
export async function removeAnalystEvent(outreachId: string, type: 'positive' | 'meeting' | 'negative'): Promise<void> {
  await query(
    `DELETE FROM email_events WHERE outreach_id = $1 AND type = $2 AND source = 'analyst'`,
    [outreachId, type],
  )
}

export type EventRow = {
  outreach_id: string
  type: EventType
  occurred_at: string
  source: EventSource
  is_machine: boolean
}

export async function eventsForSession(sessionId: string): Promise<EventRow[]> {
  return query<EventRow>(
    `SELECT outreach_id, type, occurred_at, source, is_machine
       FROM email_events WHERE session_id = $1 ORDER BY occurred_at`,
    [sessionId],
  )
}

// ── Suppression and cooldown ───────────────────────────────────

export type SuppressionReason = 'bounced' | 'unsubscribed' | 'do_not_contact'

export async function suppress(email: string, reason: SuppressionReason, by: string, note = ''): Promise<void> {
  const e = email.trim().toLowerCase()
  if (!e) return
  await query(
    `INSERT INTO contact_suppression (email, reason, note, created_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO NOTHING`,
    [e, reason, note.slice(0, 500), by],
  )
}

export async function unsuppress(email: string): Promise<void> {
  await query(`DELETE FROM contact_suppression WHERE email = $1`, [email.trim().toLowerCase()])
}

export async function listSuppressed(): Promise<
  { email: string; reason: string; note: string; created_by: string; created_at: string }[]
> {
  return query(`SELECT * FROM contact_suppression ORDER BY created_at DESC`)
}

export async function suppressionFor(emails: string[]): Promise<Map<string, string>> {
  const list = Array.from(new Set(emails.map(e => e.trim().toLowerCase()).filter(Boolean)))
  if (!list.length) return new Map()
  const rows = await query<{ email: string; reason: string }>(
    `SELECT email, reason FROM contact_suppression WHERE email = ANY($1::text[])`,
    [list],
  )
  return new Map(rows.map(r => [r.email, r.reason]))
}

/**
 * Addresses emailed for a *different* mandate in the last 14 days, with when and
 * for which session. An override with a written reason for this session lifts it.
 */
export async function cooldownFor(
  sessionId: string,
  emails: string[],
): Promise<Map<string, { sent_at: string; session_id: string }>> {
  const list = Array.from(new Set(emails.map(e => e.trim().toLowerCase()).filter(Boolean)))
  if (!list.length) return new Map()
  const rows = await query<{ email: string; sent_at: string; session_id: string }>(
    `SELECT DISTINCT ON (lower(o.contact_email))
            lower(o.contact_email) AS email, o.sent_at, o.session_id
       FROM outreach o
      WHERE lower(o.contact_email) = ANY($2::text[])
        AND o.session_id <> $1
        AND o.sent_at IS NOT NULL
        AND o.sent_at::timestamptz > now() - make_interval(days => $3)
        AND NOT EXISTS (
          SELECT 1 FROM cooldown_overrides c
           WHERE c.session_id = $1 AND c.email = lower(o.contact_email))
      ORDER BY lower(o.contact_email), o.sent_at DESC`,
    [sessionId, list, COOLDOWN_DAYS],
  )
  return new Map(rows.map(r => [r.email, { sent_at: r.sent_at, session_id: r.session_id }]))
}

export async function overrideCooldown(sessionId: string, email: string, reason: string, by: string): Promise<void> {
  await query(
    `INSERT INTO cooldown_overrides (session_id, email, reason, created_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (session_id, email) DO UPDATE SET reason = EXCLUDED.reason, created_by = EXCLUDED.created_by, created_at = now()`,
    [sessionId, email.trim().toLowerCase(), reason.slice(0, 500), by],
  )
}

/** Why an address may not be contacted from this session, or null when it may. */
export async function contactBlocks(
  sessionId: string,
  emails: string[],
): Promise<Map<string, string>> {
  const [sup, cool] = await Promise.all([suppressionFor(emails), cooldownFor(sessionId, emails)])
  const out = new Map<string, string>()
  for (const [email, reason] of Array.from(sup)) out.set(email, `Suppressed (${reason.replace(/_/g, ' ')}).`)
  for (const [email, c] of Array.from(cool)) {
    if (out.has(email)) continue
    out.set(
      email,
      `Emailed for another mandate on ${c.sent_at.slice(0, 10)}, inside the ${COOLDOWN_DAYS}-day cooldown. Override with a reason to continue.`,
    )
  }
  return out
}

// ── Audit ──────────────────────────────────────────────────────

export async function audit(input: {
  actor: string
  action: string
  targetType: string
  targetId: string
  sessionId?: string | null
  detail?: Record<string, unknown>
}): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_log (id, actor, action, target_type, target_id, session_id, detail)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [
        randomUUID(),
        input.actor,
        input.action,
        input.targetType,
        input.targetId,
        input.sessionId ?? null,
        JSON.stringify(input.detail ?? {}),
      ],
    )
  } catch (err) {
    // The audit row must never cost the action itself; a missing table is a pending migration.
    const message = err instanceof Error ? err.message : ''
    if (!/audit_log/.test(message)) throw err
    console.warn('audit_log missing. Run npm run db:migrate.')
  }
}

export async function auditFor(sessionId: string, limit = 200) {
  return query<{ actor: string; action: string; target_type: string; target_id: string; detail: Record<string, unknown>; created_at: string }>(
    `SELECT actor, action, target_type, target_id, detail, created_at
       FROM audit_log WHERE session_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [sessionId, limit],
  )
}


/**
 * Addresses that already received a first email for this mandate, by email rather
 * than by contact id, so a changed id can never put the same person in a second
 * batch or send them a second first email. Follow-ups are separate rows and are
 * not affected.
 */
export async function alreadyEmailedInSession(
  sessionId: string,
  emails: string[],
  exceptOutreachIds: string[] = [],
): Promise<Map<string, string>> {
  const list = Array.from(new Set(emails.map(e => e.trim().toLowerCase()).filter(Boolean)))
  if (!list.length) return new Map()
  const rows = await query<{ email: string; sent_at: string }>(
    `SELECT DISTINCT ON (lower(contact_email)) lower(contact_email) AS email, sent_at
       FROM outreach
      WHERE session_id = $1 AND status <> 'draft' AND sent_at IS NOT NULL
        AND lower(contact_email) = ANY($2::text[])
        AND NOT (id = ANY($3::text[]))
      ORDER BY lower(contact_email), sent_at`,
    [sessionId, list, exceptOutreachIds],
  )
  return new Map(rows.map(r => [r.email, r.sent_at]))
}
