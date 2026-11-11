-- Read-only policy candidate: isolated shadow D1 table; no production writes.
CREATE TABLE IF NOT EXISTS b2_account_daily_request_quota (
 day_utc TEXT PRIMARY KEY NOT NULL,
 total_requests INTEGER NOT NULL DEFAULT 0 CHECK(total_requests>=0),
 get_requests INTEGER NOT NULL DEFAULT 0 CHECK(get_requests>=0),
 put_requests INTEGER NOT NULL DEFAULT 0 CHECK(put_requests>=0),
 head_requests INTEGER NOT NULL DEFAULT 0 CHECK(head_requests>=0),
 native_auth_requests INTEGER NOT NULL DEFAULT 0 CHECK(native_auth_requests>=0),
 updated_at TEXT NOT NULL
);
