-- P0-B: cross-isolate B2 spool circuit breaker. This prevents a
-- credential/prefix/region 403 or provider outage from consuming hundreds
-- of daily quota reservations before an operator can diagnose the failure.
-- The original source cursor remains unchanged while the circuit is held.
CREATE TABLE IF NOT EXISTS p0b_storage_circuit (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 hold_until TEXT NOT NULL,
 last_error_code TEXT NOT NULL CHECK(last_error_code LIKE 'P0B_%'),
 updated_at TEXT NOT NULL
);
