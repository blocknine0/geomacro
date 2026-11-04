-- P2 #11: D1-atomic archived-original -> GRO evidence work notification.
-- Attach to the existing one-statement B2-restored-verified archive ACK.
-- Never infer GRO verification, publisher rights, or score from B2 ACK.
CREATE TABLE IF NOT EXISTS gro_evidence_jobs (
 record_id TEXT PRIMARY KEY CHECK(length(record_id)=64),
 raw_sha256 TEXT NOT NULL CHECK(length(raw_sha256)=64),
 b2_object_sha256 TEXT NOT NULL CHECK(length(b2_object_sha256)=64),
 archived_at TEXT NOT NULL,
 enqueued_at TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'PENDING'
  CHECK(state IN ('PENDING','DRAFT_READY','QUARANTINED')),
 processed_at TEXT,
 failure_code TEXT,
 CHECK(state <> 'DRAFT_READY' OR processed_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_gro_evidence_jobs_state_clock
 ON gro_evidence_jobs(state,enqueued_at,record_id);

CREATE TABLE IF NOT EXISTS gro_evidence (
 record_id TEXT PRIMARY KEY CHECK(length(record_id)=64),
 raw_sha256 TEXT NOT NULL CHECK(length(raw_sha256)=64),
 b2_object_sha256 TEXT NOT NULL CHECK(length(b2_object_sha256)=64),
 category TEXT NOT NULL CHECK(category IN ('geopolitics','macro','rare_earth')),
 country_iso3 TEXT CHECK(country_iso3 IS NULL OR length(country_iso3)=3),
 original_published_at TEXT NOT NULL,
 archived_at TEXT NOT NULL,
 five_part_json TEXT NOT NULL CHECK(length(five_part_json) BETWEEN 100 AND 8000),
 five_part_sha256 TEXT NOT NULL CHECK(length(five_part_sha256)=64),
 source_reliability TEXT NOT NULL DEFAULT 'ORIGINAL_PAGE_NOT_INDEPENDENTLY_VERIFIED',
 entity_extraction TEXT NOT NULL DEFAULT 'COUNTRY_ASSOCIATION_NOT_INDEPENDENTLY_VERIFIED',
 impact_scoring TEXT NOT NULL DEFAULT 'NO_INDEPENDENT_IMPACT_SCORE',
 temporal_context TEXT NOT NULL DEFAULT 'SOURCE_NATIVE_DATE_RETAINED',
 fact_cross_check TEXT NOT NULL DEFAULT 'PENDING_INDEPENDENT_CORROBORATION',
 independent_event_verified INTEGER NOT NULL DEFAULT 0 CHECK(independent_event_verified IN (0,1)),
 impact_score_0_100 INTEGER CHECK(impact_score_0_100 BETWEEN 0 AND 100),
 independent_score_attestation_sha256 TEXT CHECK(independent_score_attestation_sha256 IS NULL OR length(independent_score_attestation_sha256)=64),
 is_gro_verified INTEGER NOT NULL DEFAULT 0 CHECK(is_gro_verified IN (0,1)),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 CHECK(is_gro_verified = 0 OR (
  independent_event_verified=1 AND impact_score_0_100 IS NOT NULL
  AND independent_score_attestation_sha256 IS NOT NULL
  AND source_reliability='VERIFIED'
  AND entity_extraction='VERIFIED'
  AND impact_scoring='VERIFIED'
  AND temporal_context='VERIFIED'
  AND fact_cross_check='VERIFIED'
 )),
 FOREIGN KEY(record_id) REFERENCES phase2h_private_raw_news(record_id)
);
CREATE INDEX IF NOT EXISTS idx_gro_evidence_verified_category
 ON gro_evidence(is_gro_verified,category,original_published_at DESC);

-- One original B2 ACK produces one immutable retryable outbox event, all in
-- the archive UPDATE's SQLite transaction. Duplicate ACKs cannot enqueue.
CREATE TRIGGER IF NOT EXISTS trg_phase2h_b2_archive_gro_enqueue
 AFTER UPDATE OF b2_object_sha256 ON phase2h_private_raw_news
 WHEN OLD.b2_object_sha256 IS NULL
  AND NEW.b2_object_sha256 IS NOT NULL
  AND NEW.b2_archived_at IS NOT NULL
 BEGIN
  INSERT OR IGNORE INTO gro_evidence_jobs(
   record_id,raw_sha256,b2_object_sha256,archived_at,enqueued_at,state)
  VALUES(
   NEW.record_id,NEW.raw_sha256,NEW.b2_object_sha256,
   NEW.b2_archived_at,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'PENDING');
 END;
