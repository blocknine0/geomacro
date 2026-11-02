-- Corridor-only evidence chains and five-part derived research.
-- Audit of source D1 rows MUST pass before insert. No raw publisher content.
-- Never a signed/paid/public risk delivery.
CREATE TABLE IF NOT EXISTS corridor_private_derived_research (
 research_id TEXT PRIMARY KEY CHECK(length(research_id)=64),
 source_reference_id TEXT NOT NULL CHECK(length(source_reference_id)=64),
 source_id TEXT NOT NULL,
 claim_sha256 TEXT NOT NULL CHECK(length(claim_sha256)=64),
 proof_sha256 TEXT NOT NULL CHECK(length(proof_sha256)=64),
 analysis_sha256 TEXT NOT NULL CHECK(length(analysis_sha256)=64),
 structured_json TEXT NOT NULL CHECK(length(structured_json) BETWEEN 80 AND 6000),
 created_at TEXT NOT NULL,
 last_verified_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_corridor_private_derived_ttl
 ON corridor_private_derived_research(last_verified_at,research_id);
CREATE INDEX IF NOT EXISTS idx_corridor_private_derived_source
 ON corridor_private_derived_research(source_id,last_verified_at DESC);
