-- Tables mail merge calls that are not the merge runs themselves.
-- send_requests: one row per Idempotency-Key, so a retry does not send twice.
-- contact_suppression: addresses that must not be emailed.
-- audit_log: who sent which batch.
-- Does not create or alter outreach tables.

CREATE TABLE IF NOT EXISTS send_requests (
  idempotency_key TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL,
  requested_by    TEXT NOT NULL,
  request_hash    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'in_progress',
  response        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS send_requests_session_idx ON send_requests (session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS contact_suppression (
  email      TEXT PRIMARY KEY,
  reason     TEXT NOT NULL,
  note       TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (reason IN ('bounced', 'unsubscribed', 'do_not_contact'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  actor       TEXT NOT NULL,
  action      TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  session_id  TEXT,
  detail      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_session_idx ON audit_log (session_id, created_at DESC);
