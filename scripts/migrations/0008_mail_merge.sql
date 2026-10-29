-- 0008: mail merge sends and their tracking. Separate from outreach on purpose:
-- nothing here reads or writes outreach, email_events or the outreach tracker.
--
--   mail_merge_runs     : one row per press of Send (a merge may span several batches)
--   mail_merge_messages : one row per email, with open, click, reply and bounce state
--
-- Additive. Rollback: DROP TABLE IF EXISTS mail_merge_messages;
--                     DROP TABLE IF EXISTS mail_merge_runs;
--                     DELETE FROM schema_migrations WHERE version = '0008';

CREATE TABLE IF NOT EXISTS mail_merge_runs (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  subject    TEXT NOT NULL DEFAULT '',
  mailbox    TEXT NOT NULL DEFAULT '',
  tracking   BOOLEAN NOT NULL DEFAULT false,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mail_merge_messages (
  id                  TEXT PRIMARY KEY,
  run_id              TEXT NOT NULL REFERENCES mail_merge_runs(id) ON DELETE CASCADE,
  record              INTEGER,
  to_email            TEXT NOT NULL,
  cc                  TEXT[] NOT NULL DEFAULT '{}',
  bcc                 TEXT[] NOT NULL DEFAULT '{}',
  subject             TEXT NOT NULL,
  -- sending -> sent | failed | unknown
  status              TEXT NOT NULL DEFAULT 'sending',
  error               TEXT,
  sent_by             TEXT NOT NULL,
  sent_at             TIMESTAMPTZ,
  graph_message_id    TEXT,
  internet_message_id TEXT,
  conversation_id     TEXT,
  tracking            BOOLEAN NOT NULL DEFAULT false,
  open_count          INTEGER NOT NULL DEFAULT 0,
  machine_open_count  INTEGER NOT NULL DEFAULT 0,
  first_opened_at     TIMESTAMPTZ,
  last_opened_at      TIMESTAMPTZ,
  click_count         INTEGER NOT NULL DEFAULT 0,
  machine_click_count INTEGER NOT NULL DEFAULT 0,
  first_clicked_at    TIMESTAMPTZ,
  last_clicked_at     TIMESTAMPTZ,
  clicked_urls        TEXT[] NOT NULL DEFAULT '{}',
  replied_at          TIMESTAMPTZ,
  reply_from          TEXT,
  reply_snippet       TEXT,
  reply_count         INTEGER NOT NULL DEFAULT 0,
  auto_reply_at       TIMESTAMPTZ,
  bounced_at          TIMESTAMPTZ,
  bounce_reason       TEXT,
  checked_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status IN ('sending', 'sent', 'failed', 'unknown'))
);

CREATE INDEX IF NOT EXISTS mail_merge_messages_run_idx ON mail_merge_messages (run_id, record);
CREATE INDEX IF NOT EXISTS mail_merge_messages_to_idx ON mail_merge_messages (lower(to_email));
