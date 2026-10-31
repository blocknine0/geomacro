-- Issue 3295: D1-only customer OTP state (no Supabase, payment or PREDGE writes).
CREATE TABLE IF NOT EXISTS customer_otp_challenges (
  challenge_id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  otp_hmac_sha256 TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
  consumed_session_id TEXT
);
CREATE TABLE IF NOT EXISTS customer_otp_send_events (
  event_id TEXT PRIMARY KEY,
  email_hmac_sha256 TEXT NOT NULL,
  sent_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customer_email_events_day ON customer_otp_send_events(sent_at);
CREATE INDEX IF NOT EXISTS idx_customer_email_events_address ON customer_otp_send_events(email_hmac_sha256,sent_at);
ALTER TABLE sessions ADD COLUMN otp_challenge_id TEXT REFERENCES customer_otp_challenges(challenge_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_session_one_per_challenge ON sessions(otp_challenge_id) WHERE otp_challenge_id IS NOT NULL;
