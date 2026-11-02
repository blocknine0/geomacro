-- Bounded continuous GeoMacro strategic corridor context; metadata only.
-- No event score, signed GRO, PREDGE writes, customer debit or x402 activation.
CREATE TABLE IF NOT EXISTS corridor_risk_gate_strategic_snapshots (
 corridor_id TEXT PRIMARY KEY
  CHECK(corridor_id IN ('red-sea','taiwan-strait','hormuz','suez','malacca')),
 checked_at TEXT NOT NULL,
 content_sha256 TEXT NOT NULL CHECK(length(content_sha256)=64),
 source_candidate_count INTEGER NOT NULL CHECK(source_candidate_count BETWEEN 0 AND 60),
 structured_json TEXT NOT NULL CHECK(length(structured_json) BETWEEN 800 AND 28000)
);
CREATE INDEX IF NOT EXISTS idx_corridor_risk_gate_strategic_freshness
 ON corridor_risk_gate_strategic_snapshots(checked_at,corridor_id);
