-- GeoMacro Certified News Severity GRI: durable last-qualified, category-separated
-- continuity. No raw article/source storage, no payment or PREDGE changes.
-- This table is *not* a source of fresh news, and never rewrites source clocks.
CREATE TABLE IF NOT EXISTS geomacro_news_gri_last_verified (
 category TEXT PRIMARY KEY
   CHECK(category IN ('geopolitics','macro','critical_minerals')),
 methodology_version TEXT NOT NULL,
 index_json TEXT NOT NULL CHECK(length(index_json) BETWEEN 2 AND 16384),
 index_sha256 TEXT NOT NULL CHECK(length(index_sha256)=64),
 evidence_sha256 TEXT NOT NULL CHECK(length(evidence_sha256)=64),
 fingerprints_json TEXT NOT NULL CHECK(length(fingerprints_json) BETWEEN 2 AND 50000),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0)
);
