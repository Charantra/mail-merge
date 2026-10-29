/**
 * Idempotency rows for mail merge sends.
 * Taken from the outreach storage module. This app does not import the session store.
 */
import { query, queryOne } from './db'

export type StoredSendResponse = { status: number; body: Record<string, unknown> }

export type SendRequestRow = {
  idempotency_key: string
  session_id: string
  requested_by: string
  request_hash: string
  status: 'in_progress' | 'completed'
  response: StoredSendResponse | null
}

/**
 * Register an Idempotency-Key. Returns null when this request owns the key, or the
 * existing row when the key was used before (a retry, or a reuse for another request).
 */
export async function beginSendRequest(input: {
  key: string
  sessionId: string
  by: string
  requestHash: string
}): Promise<SendRequestRow | null> {
  const inserted = await query(
    `INSERT INTO send_requests (idempotency_key, session_id, requested_by, request_hash)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING idempotency_key`,
    [input.key, input.sessionId, input.by, input.requestHash],
  )
  if (inserted.length) return null
  return queryOne<SendRequestRow>('SELECT * FROM send_requests WHERE idempotency_key = $1', [
    input.key,
  ])
}

export async function completeSendRequest(
  key: string,
  response: StoredSendResponse,
): Promise<void> {
  await query(
    `UPDATE send_requests SET status = 'completed', response = $2::jsonb, completed_at = now()
      WHERE idempotency_key = $1`,
    [key, JSON.stringify(response)],
  )
}
