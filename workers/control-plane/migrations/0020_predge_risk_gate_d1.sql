-- Predge canonical Risk Gate: durable free Cloudflare D1 state, no Supabase.
-- Store only client/request identifiers, request hash and decision summary.
-- No raw publisher evidence, plaintext bearer or private signing material.
CREATE TABLE IF NOT EXISTS risk_gate_d1_requests (
 client_id TEXT NOT NULL,
 request_id TEXT NOT NULL,
 request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
 subject_type TEXT NOT NULL CHECK(subject_type IN ('country','corridor')),
 subject_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('PENDING','CLAIMED','DONE')),
 response_json TEXT,
 finished_at TEXT,
 object_id TEXT,
 decision TEXT,
 PRIMARY KEY(client_id,request_id)
);
CREATE INDEX IF NOT EXISTS idx_risk_gate_d1_request_created
 ON risk_gate_d1_requests(created_at);
CREATE TABLE IF NOT EXISTS risk_gate_d1_quota (
 client_id TEXT NOT NULL,
 usage_day TEXT NOT NULL,
 used INTEGER NOT NULL DEFAULT 0 CHECK(used>=0 AND used<=500),
 PRIMARY KEY(client_id,usage_day)
);
-- The corridor table is independent of country hot data. No unsigned score
-- combination is allowed as a substitute for a genuine signed corridor GRO.
CREATE TABLE IF NOT EXISTS corridor_gro_verified_hot (
 corridor_id TEXT PRIMARY KEY,
 object_id TEXT NOT NULL UNIQUE,
 schema_version TEXT NOT NULL,
 generated_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 signing_key_id TEXT NOT NULL,
 payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64),
 record_sha256 TEXT NOT NULL CHECK(length(record_sha256)=64),
 archive_write_acknowledged INTEGER NOT NULL CHECK(archive_write_acknowledged IN (0,1)),
 object_json TEXT NOT NULL,
 verified_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_corridor_gro_verified_hot_expires ON
 corridor_gro_verified_hot(expires_at);
