-- Separate, shared, UTC-day physical-write reservation counter. Never delete
-- while an active day can still receive writes. Does not control other DBs
-- unless EVERY independent producer routes through the same governor.
CREATE TABLE IF NOT EXISTS geomacro_d1_soft_write_budget (
  day_utc TEXT PRIMARY KEY NOT NULL,
  reserved_rows INTEGER NOT NULL DEFAULT 0 CHECK(reserved_rows>=0),
  observed_provider_highwater INTEGER NOT NULL DEFAULT 0 CHECK(observed_provider_highwater>=0),
  updated_at TEXT NOT NULL
);
