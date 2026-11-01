-- #3295 P0-1: additive only; apply after 0090..0093. No funding/import.
-- 0092 has UNIQUE(email) and one-session-per-challenge; leave historical rows
-- untouched and use a generation-specific challenge for repeat sign-ins.
CREATE TABLE customer_login_challenges (
 challenge_id TEXT PRIMARY KEY NOT NULL,
 email TEXT NOT NULL COLLATE NOCASE,
 otp_hmac_sha256 TEXT NOT NULL CHECK(length(otp_hmac_sha256)=64),
 requested_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 delivery_status TEXT NOT NULL DEFAULT 'pending' CHECK(delivery_status IN ('pending','accepted','failed')),
 consumed_session_id TEXT UNIQUE,
 CHECK(expires_at>requested_at)
);
CREATE INDEX idx_customer_login_email ON customer_login_challenges(email,requested_at);
ALTER TABLE sessions ADD COLUMN login_challenge_id TEXT REFERENCES customer_login_challenges(challenge_id);
CREATE UNIQUE INDEX idx_customer_login_single_use ON sessions(login_challenge_id) WHERE login_challenge_id IS NOT NULL;
ALTER TABLE customer_otp_send_events ADD COLUMN ip_hmac_sha256 TEXT;
CREATE INDEX idx_customer_send_ip ON customer_otp_send_events(ip_hmac_sha256,sent_at);
CREATE TABLE customer_login_verify_events (
 event_id TEXT PRIMARY KEY NOT NULL,
 email_hmac_sha256 TEXT NOT NULL,
 ip_hmac_sha256 TEXT NOT NULL,
 attempted_at TEXT NOT NULL
);
CREATE INDEX idx_customer_verify_email ON customer_login_verify_events(email_hmac_sha256,attempted_at);
CREATE INDEX idx_customer_verify_ip ON customer_login_verify_events(ip_hmac_sha256,attempted_at);
CREATE TRIGGER trg_customer_login_session_guard BEFORE INSERT ON sessions
WHEN NEW.login_challenge_id IS NOT NULL
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customer_login_challenges c JOIN users u ON u.email=c.email
  WHERE c.challenge_id=NEW.login_challenge_id AND c.consumed_session_id=NEW.id
  AND c.delivery_status='accepted' AND c.expires_at>NEW.created_at AND u.id=NEW.user_id)
 THEN RAISE(ABORT,'CUSTOMER_LOGIN_CHALLENGE_REQUIRED') END;
END;