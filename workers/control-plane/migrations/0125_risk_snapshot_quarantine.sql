-- Preserve invalid same-day Risk Gate snapshots before a verified replacement.
-- The quarantine is private D1 audit data; canonical rows remain one-per-target/day.
CREATE TABLE IF NOT EXISTS d1_snapshot_repair_log (
 repair_id TEXT PRIMARY KEY CHECK(length(repair_id)=64),
 target_table TEXT NOT NULL CHECK(target_table='unified_risk_snapshots'),
 entity_type TEXT NOT NULL CHECK(entity_type IN ('COUNTRY','CORRIDOR')),
 entity_id TEXT NOT NULL,
 day_utc TEXT NOT NULL,
 corrupted_payload TEXT NOT NULL,
 corrupted_audit_proof_json TEXT NOT NULL,
 corrupted_content_sha256 TEXT NOT NULL,
 failure_code TEXT NOT NULL,
 action_taken TEXT NOT NULL CHECK(action_taken='QUARANTINED_AND_SUPERSEDED'),
 repaired_by_run TEXT NOT NULL,
 replacement_content_sha256 TEXT NOT NULL CHECK(length(replacement_content_sha256)=64),
 created_at TEXT NOT NULL,
 UNIQUE(target_table,entity_type,entity_id,day_utc,corrupted_content_sha256,replacement_content_sha256)
);
CREATE INDEX IF NOT EXISTS idx_d1_snapshot_repair_target_day
 ON d1_snapshot_repair_log(entity_type,entity_id,day_utc,created_at);
