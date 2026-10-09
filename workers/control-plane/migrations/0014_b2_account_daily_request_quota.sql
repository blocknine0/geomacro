-- #1827: one atomic account-wide B2 admission ledger on the existing D1.
-- Each external B2 HTTP attempt must reserve a ticket BEFORE network I/O.
-- A failed/unknown request deliberately consumes the ticket: conservative
-- accounting avoids replaying reservations after transport ambiguity.
-- Historical payloads remain B2-authoritative, no Supabase dependency.
CREATE TABLE IF NOT EXISTS b2_account_daily_request_quota (
  day_utc TEXT PRIMARY KEY NOT NULL
    CHECK (length(day_utc)=10 AND day_utc GLOB '????-??-??'),
  total_requests INTEGER NOT NULL DEFAULT 0 CHECK (total_requests >= 0),
  get_requests INTEGER NOT NULL DEFAULT 0 CHECK (get_requests >= 0),
  put_requests INTEGER NOT NULL DEFAULT 0 CHECK (put_requests >= 0),
  head_requests INTEGER NOT NULL DEFAULT 0 CHECK (head_requests >= 0),
  native_auth_requests INTEGER NOT NULL DEFAULT 0 CHECK (native_auth_requests >= 0),
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS b2_request_quota_workflow_receipt (\n  day_utc TEXT NOT NULL,\n  workflow_id TEXT NOT NULL,\n  operation TEXT NOT NULL CHECK (operation IN ('GET','PUT','HEAD','NATIVE_AUTH')),\n  requests INTEGER NOT NULL CHECK (requests >= 0),\n  updated_at TEXT NOT NULL,\n  PRIMARY KEY(day_utc, workflow_id, operation)\n);\n\nCREATE INDEX IF NOT EXISTS idx_b2_account_daily_request_quota_updated
  ON b2_account_daily_request_quota(updated_at);

UPDATE schema_meta
SET version = 5, updated_at = '2026-10-09T16:00:00.000Z'
WHERE name = 'control-plane' AND version < 5;
