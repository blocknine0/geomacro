-- Private source-evidence Risk Gate packs, never public/signed/paid.
CREATE TABLE IF NOT EXISTS corridor_risk_gate_source_packs (
 snapshot_id TEXT PRIMARY KEY CHECK(length(snapshot_id)=64),
 checked_at TEXT NOT NULL,
 content_sha256 TEXT NOT NULL CHECK(length(content_sha256)=64),
 source_ref_count INTEGER NOT NULL CHECK(source_ref_count BETWEEN 0 AND 18),
 structured_json TEXT NOT NULL CHECK(length(structured_json) BETWEEN 600 AND 24000),
 last_verified_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_risk_gate_source_pack_ttl
 ON corridor_risk_gate_source_packs(checked_at,snapshot_id);
