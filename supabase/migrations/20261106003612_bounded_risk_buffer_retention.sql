-- Bounded, indexed seven-day retention in the separate operational buffer.
-- Runs as the caller (cron owner or service_role); never grants public access.
CREATE OR REPLACE FUNCTION public.geomacro_purge_risk_buffer_7d()
RETURNS void LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
SET statement_timeout = '5s'
SET lock_timeout = '1s'
AS $function$
DECLARE cutoff timestamptz := now() - interval '7 days';
BEGIN
  WITH expired AS (
    SELECT id FROM public.geomacro_risk_signal_7d
    WHERE ingested_at < cutoff
    ORDER BY ingested_at, id
    LIMIT 1000 FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.geomacro_risk_signal_7d AS t USING expired AS e
  WHERE t.id=e.id;
  WITH expired AS (
    SELECT id FROM public.geomacro_corridor_candidate_7d
    WHERE ingested_at < cutoff
    ORDER BY ingested_at, id
    LIMIT 1000 FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.geomacro_corridor_candidate_7d AS t USING expired AS e
  WHERE t.id=e.id;
  WITH expired AS (
    SELECT assessment_sha256 FROM public.geomacro_risk_assessment_7d
    WHERE ingested_at < cutoff
    ORDER BY ingested_at, assessment_sha256
    LIMIT 1000 FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.geomacro_risk_assessment_7d AS t USING expired AS e
  WHERE t.assessment_sha256=e.assessment_sha256;
  WITH expired AS (
    SELECT entity_type, entity_id, day_utc FROM public.geomacro_unified_risk_daily
    WHERE generated_at < cutoff
    ORDER BY generated_at, entity_type, entity_id, day_utc
    LIMIT 1000 FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.geomacro_unified_risk_daily AS t USING expired AS e
  WHERE t.entity_type=e.entity_type AND t.entity_id=e.entity_id AND t.day_utc=e.day_utc;
  WITH expired AS (
    SELECT corridor_id, day_utc FROM public.geomacro_daily_tiered_risk_gates
    WHERE generated_at < cutoff
    ORDER BY generated_at, corridor_id, day_utc
    LIMIT 1000 FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.geomacro_daily_tiered_risk_gates AS t USING expired AS e
  WHERE t.corridor_id=e.corridor_id AND t.day_utc=e.day_utc;
END;
$function$;
REVOKE ALL ON FUNCTION public.geomacro_purge_risk_buffer_7d() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.geomacro_purge_risk_buffer_7d() TO service_role;

-- The archive trigger uses fully qualified application tables and a pinned path.
ALTER FUNCTION public.enqueue_gro_evidence_after_b2_archive()
  SET search_path = pg_catalog, public;
