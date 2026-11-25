-- Add Mailjet as the third OTP delivery provider without discarding dispatch history.
-- Legacy mailersend values remain valid in the ledger so every prior row is preserved.
-- Match the protected D1 migration bound: abort atomically before copying if
-- the ledger exceeds 3,000 rows. The probe reads at most 3,001 source rows.
CREATE TABLE customer_email_dispatch_0227_bound_guard (
 within_bound INTEGER NOT NULL CHECK(within_bound=1)
);
INSERT INTO customer_email_dispatch_0227_bound_guard
SELECT CASE WHEN EXISTS(
 SELECT 1 FROM customer_email_dispatch_attempts LIMIT 1 OFFSET 3000
) THEN 0 ELSE 1 END;
DROP TABLE customer_email_dispatch_0227_bound_guard;

CREATE TABLE customer_email_dispatch_attempts_0227 (
 attempt_id TEXT PRIMARY KEY NOT NULL,
 challenge_id TEXT NOT NULL,
 provider TEXT NOT NULL CHECK(provider IN ('resend','brevo','mailersend','mailjet')),
 status TEXT NOT NULL CHECK(status IN ('reserved','accepted','rejected','unknown')),
 submitted_at TEXT NOT NULL,
 completed_at TEXT,
 external_message_id TEXT,
 CHECK(length(challenge_id) >= 16)
);

INSERT INTO customer_email_dispatch_attempts_0227
 (attempt_id,challenge_id,provider,status,submitted_at,completed_at,external_message_id)
SELECT attempt_id,challenge_id,provider,status,submitted_at,completed_at,external_message_id
FROM customer_email_dispatch_attempts;

DROP TABLE customer_email_dispatch_attempts;
ALTER TABLE customer_email_dispatch_attempts_0227 RENAME TO customer_email_dispatch_attempts;

CREATE INDEX idx_customer_email_provider_daily
 ON customer_email_dispatch_attempts(provider,submitted_at);
CREATE INDEX idx_customer_email_dispatch_challenge
 ON customer_email_dispatch_attempts(challenge_id,status);
