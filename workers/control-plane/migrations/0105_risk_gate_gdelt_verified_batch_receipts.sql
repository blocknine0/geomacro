-- Monotonic, 72h source-batch receipts: written ONLY after B2 exact
-- archive readback and canonical D1 event-row proof. Even 0-event batches.
CREATE TABLE IF NOT EXISTS risk_gate_gdelt_verified_batches (
 batch_at TEXT PRIMARY KEY,
 archive_sha256 TEXT NOT NULL CHECK(length(archive_sha256)=64),
 b2_archive_key TEXT NOT NULL,
 b2_manifest_sha256 TEXT NOT NULL CHECK(length(b2_manifest_sha256)=64),
 b2_event_reference_count INTEGER NOT NULL CHECK(b2_event_reference_count BETWEEN 0 AND 30000),
 d1_hot_record_count INTEGER NOT NULL CHECK(d1_hot_record_count BETWEEN 0 AND 40),
 verified_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rg_gdelt_batches_verified_at
 ON risk_gate_gdelt_verified_batches(verified_at DESC);
