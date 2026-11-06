-- Private signing preparation only. Real-time Risk Gate reads never wait on it.
CREATE TABLE IF NOT EXISTS gro_auto_signing_jobs (
 input_sha256 TEXT PRIMARY KEY CHECK(length(input_sha256)=64),
 b2_key TEXT NOT NULL UNIQUE,
 country_iso3 TEXT NOT NULL CHECK(length(country_iso3)=3),
 state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','LEASED','RETRY','SIGNED','EXPIRED')),
 available_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT,
 lease_until TEXT,
 signed_record_sha256 TEXT,
 signed_gro_expires_at TEXT,
 last_error_code TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gro_auto_signing_due ON gro_auto_signing_jobs(state,available_at,created_at);
CREATE INDEX IF NOT EXISTS idx_gro_auto_signing_lease ON gro_auto_signing_jobs(state,lease_until);
CREATE INDEX IF NOT EXISTS idx_gro_auto_signing_expiry ON gro_auto_signing_jobs(state,expires_at);
CREATE TABLE IF NOT EXISTS gro_auto_signing_cycles (
 run_id TEXT PRIMARY KEY,
 source_sha TEXT NOT NULL,
 started_at TEXT NOT NULL,
 finished_at TEXT,
 signer_key_id TEXT NOT NULL,
 signer_pair_verified INTEGER NOT NULL CHECK(signer_pair_verified=1),
 claimed INTEGER NOT NULL DEFAULT 0,
 signed INTEGER NOT NULL DEFAULT 0,
 failed INTEGER NOT NULL DEFAULT 0,
 state TEXT NOT NULL CHECK(state IN ('RUNNING','DONE','PARTIAL','FAILED'))
);
CREATE INDEX IF NOT EXISTS idx_gro_auto_signing_cycle_finished ON gro_auto_signing_cycles(finished_at DESC);
-- Latest immutable category inputs allow separately arriving categories to
-- form a single country GRO without copying raw publisher data into D1.
CREATE TABLE IF NOT EXISTS gro_auto_signing_category_inputs (
 country_iso3 TEXT NOT NULL,
 category TEXT NOT NULL CHECK(category IN ('geopolitics','macro','rare_earth')),
 input_sha256 TEXT NOT NULL CHECK(length(input_sha256)=64),
 b2_key TEXT NOT NULL,
 source_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(country_iso3,category)
);
CREATE INDEX IF NOT EXISTS idx_gro_auto_category_expiry ON gro_auto_signing_category_inputs(expires_at);
