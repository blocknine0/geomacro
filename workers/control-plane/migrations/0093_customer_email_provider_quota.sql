-- Per-provider account-wide dispatch reservations. Never store OTP or recipients.
CREATE TABLE IF NOT EXISTS customer_email_dispatch_attempts (
 attempt_id TEXT PRIMARY KEY NOT NULL,
 challenge_id TEXT NOT NULL,
 provider TEXT NOT NULL CHECK(provider IN ('resend','brevo','mailersend')),
 status TEXT NOT NULL CHECK(status IN ('reserved','accepted','rejected','unknown')),
 submitted_at TEXT NOT NULL,
 completed_at TEXT,
 external_message_id TEXT,
 CHECK(length(challenge_id) >= 16)
);
CREATE INDEX IF NOT EXISTS idx_customer_email_provider_daily
 ON customer_email_dispatch_attempts(provider,submitted_at);
CREATE INDEX IF NOT EXISTS idx_customer_email_dispatch_challenge
 ON customer_email_dispatch_attempts(challenge_id,status);

CREATE TABLE IF NOT EXISTS customer_email_dispatch_challenges (challenge_id TEXT PRIMARY KEY, started_at TEXT NOT NULL);
