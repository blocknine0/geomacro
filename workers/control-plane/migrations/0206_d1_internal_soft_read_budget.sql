-- Shared UTC-day internal soft-read reservations. This only governs callers that
-- reserve before every D1 read through the common admission service.
CREATE TABLE IF NOT EXISTS geomacro_d1_soft_read_budget (
  day_utc TEXT PRIMARY KEY NOT NULL,
  reserved_rows INTEGER NOT NULL DEFAULT 0 CHECK(reserved_rows>=0),
  observed_provider_highwater INTEGER NOT NULL DEFAULT 0 CHECK(observed_provider_highwater>=0),
  updated_at TEXT NOT NULL,
  tokens_milli INTEGER NOT NULL DEFAULT 20000000
    CHECK(tokens_milli>=0 AND tokens_milli<=20000000),
  last_refill_ms INTEGER NOT NULL DEFAULT 0 CHECK(last_refill_ms>=0)
);
