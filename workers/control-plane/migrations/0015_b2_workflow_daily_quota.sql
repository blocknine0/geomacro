CREATE TABLE IF NOT EXISTS b2_account_daily_workflow_quota (
  day_utc TEXT NOT NULL CHECK (day_utc GLOB '????-??-??'),
  workflow_id TEXT NOT NULL,
  get_requests INTEGER NOT NULL DEFAULT 0 CHECK (get_requests >= 0),
  put_requests INTEGER NOT NULL DEFAULT 0 CHECK (put_requests >= 0),
  total_requests INTEGER NOT NULL DEFAULT 0 CHECK (total_requests >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (day_utc, workflow_id)
);
CREATE INDEX IF NOT EXISTS b2_account_daily_workflow_quota_updated_idx
  ON b2_account_daily_workflow_quota (updated_at);

UPDATE schema_meta
SET version = 6, updated_at = CURRENT_TIMESTAMP
WHERE name = 'control-plane' AND version < 6;
