-- Mirror the D1 GRO archive evidence/outbox schema in the isolated 7-day
-- Supabase project. This migration creates schema only; no source rows copy.
BEGIN;

CREATE TABLE IF NOT EXISTS public.phase2h_private_raw_news (
 record_id text PRIMARY KEY CHECK (length(record_id)=64),
 category text NOT NULL CHECK (category IN ('geopolitics','macro','rare_earth')),
 original_published_at text NOT NULL,
 first_ingested_at text NOT NULL,
 raw_sha256 text NOT NULL CHECK (length(raw_sha256)=64),
 raw_json text NOT NULL CHECK (length(raw_json) BETWEEN 300 AND 12000),
 b2_object_sha256 text DEFAULT NULL
  CHECK (b2_object_sha256 IS NULL OR length(b2_object_sha256)=64),
 b2_archived_at text DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS idx_phase2h_unarchived
 ON public.phase2h_private_raw_news(b2_object_sha256,first_ingested_at,record_id);
CREATE INDEX IF NOT EXISTS idx_phase2h_native_category
 ON public.phase2h_private_raw_news(category,original_published_at DESC);

CREATE TABLE IF NOT EXISTS public.gro_evidence_jobs (
 record_id text PRIMARY KEY CHECK (length(record_id)=64),
 raw_sha256 text NOT NULL CHECK (length(raw_sha256)=64),
 b2_object_sha256 text NOT NULL CHECK (length(b2_object_sha256)=64),
 archived_at text NOT NULL,
 enqueued_at text NOT NULL,
 state text NOT NULL DEFAULT 'PENDING'
  CHECK (state IN ('PENDING','DRAFT_READY','QUARANTINED')),
 processed_at text,
 failure_code text,
 CHECK (state <> 'DRAFT_READY' OR processed_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_gro_evidence_jobs_state_clock
 ON public.gro_evidence_jobs(state,enqueued_at,record_id);
CREATE INDEX IF NOT EXISTS idx_gro_evidence_jobs_archive_slo
 ON public.gro_evidence_jobs(archived_at,record_id);

CREATE TABLE IF NOT EXISTS public.gro_evidence (
 record_id text PRIMARY KEY CHECK (length(record_id)=64),
 raw_sha256 text NOT NULL CHECK (length(raw_sha256)=64),
 b2_object_sha256 text NOT NULL CHECK (length(b2_object_sha256)=64),
 category text NOT NULL CHECK (category IN ('geopolitics','macro','rare_earth')),
 country_iso3 text CHECK (country_iso3 IS NULL OR length(country_iso3)=3),
 original_published_at text NOT NULL,
 archived_at text NOT NULL,
 five_part_json text NOT NULL CHECK (length(five_part_json) BETWEEN 100 AND 8000),
 five_part_sha256 text NOT NULL CHECK (length(five_part_sha256)=64),
 five_part_filled integer NOT NULL DEFAULT 0 CHECK (five_part_filled IN (0,1)),
 source_reliability text NOT NULL DEFAULT 'ORIGINAL_PAGE_NOT_INDEPENDENTLY_VERIFIED',
 entity_extraction text NOT NULL DEFAULT 'COUNTRY_ASSOCIATION_NOT_INDEPENDENTLY_VERIFIED',
 impact_scoring text NOT NULL DEFAULT 'NO_INDEPENDENT_IMPACT_SCORE',
 temporal_context text NOT NULL DEFAULT 'SOURCE_NATIVE_DATE_RETAINED',
 fact_cross_check text NOT NULL DEFAULT 'PENDING_INDEPENDENT_CORROBORATION',
 independent_event_verified integer NOT NULL DEFAULT 0 CHECK (independent_event_verified IN (0,1)),
 impact_score_0_100 integer CHECK (impact_score_0_100 BETWEEN 0 AND 100),
 independent_score_attestation_sha256 text
  CHECK (independent_score_attestation_sha256 IS NULL OR length(independent_score_attestation_sha256)=64),
 is_gro_verified integer NOT NULL DEFAULT 0 CHECK (is_gro_verified IN (0,1)),
 created_at text NOT NULL,
 updated_at text NOT NULL,
 CHECK (is_gro_verified=0 OR (
  five_part_filled=1 AND independent_event_verified=1 AND impact_score_0_100 IS NOT NULL
  AND independent_score_attestation_sha256 IS NOT NULL
  AND source_reliability='VERIFIED'
  AND entity_extraction='VERIFIED'
  AND impact_scoring='VERIFIED'
  AND temporal_context='VERIFIED'
  AND fact_cross_check='VERIFIED'
 )),
 FOREIGN KEY(record_id) REFERENCES public.phase2h_private_raw_news(record_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_gro_evidence_verified_category
 ON public.gro_evidence(is_gro_verified,category,original_published_at DESC);

CREATE TABLE IF NOT EXISTS public.gro_evidence_backfill_state (
 singleton integer PRIMARY KEY CHECK (singleton=1),
 last_record_id text NOT NULL,
 updated_at text NOT NULL
);

CREATE OR REPLACE FUNCTION public.enqueue_gro_evidence_after_b2_archive()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
 IF OLD.b2_object_sha256 IS NULL
    AND NEW.b2_object_sha256 IS NOT NULL
    AND NEW.b2_archived_at IS NOT NULL THEN
  INSERT INTO public.gro_evidence_jobs(
   record_id,raw_sha256,b2_object_sha256,archived_at,enqueued_at,state)
  VALUES(
   NEW.record_id,NEW.raw_sha256,NEW.b2_object_sha256,NEW.b2_archived_at,
   to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'PENDING')
  ON CONFLICT(record_id) DO NOTHING;
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_phase2h_b2_archive_gro_enqueue
 ON public.phase2h_private_raw_news;
CREATE TRIGGER trg_phase2h_b2_archive_gro_enqueue
 AFTER UPDATE OF b2_object_sha256 ON public.phase2h_private_raw_news
 FOR EACH ROW EXECUTE FUNCTION public.enqueue_gro_evidence_after_b2_archive();

ALTER TABLE public.phase2h_private_raw_news ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gro_evidence_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gro_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gro_evidence_backfill_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.phase2h_private_raw_news,public.gro_evidence_jobs,
 public.gro_evidence,public.gro_evidence_backfill_state FROM anon,authenticated;
GRANT ALL ON public.phase2h_private_raw_news,public.gro_evidence_jobs,
 public.gro_evidence,public.gro_evidence_backfill_state TO service_role;
REVOKE ALL ON FUNCTION public.enqueue_gro_evidence_after_b2_archive() FROM PUBLIC;

COMMIT;
