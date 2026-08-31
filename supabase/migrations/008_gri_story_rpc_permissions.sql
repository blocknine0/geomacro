BEGIN;

-- ============================================================
-- Lock GRI story-correlation RPC execution to service_role only.
--
-- Migration 007 revoked PUBLIC execution, but Supabase may retain
-- explicit EXECUTE privileges for anon/authenticated roles.
-- This migration removes those exact grants without modifying
-- the already-applied immutable story schema.
-- ============================================================

REVOKE ALL
ON FUNCTION public.create_gri_story_cluster_with_assignments(
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  text,
  jsonb
)
FROM PUBLIC, anon, authenticated;

REVOKE ALL
ON FUNCTION public.assign_gri_event_to_story_cluster(
  uuid,
  uuid,
  text,
  numeric,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  text
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.create_gri_story_cluster_with_assignments(
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  text,
  jsonb
)
TO service_role;

GRANT EXECUTE
ON FUNCTION public.assign_gri_event_to_story_cluster(
  uuid,
  uuid,
  text,
  numeric,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  text
)
TO service_role;

COMMIT;
