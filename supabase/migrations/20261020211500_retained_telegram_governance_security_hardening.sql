-- First-pass live project hardening, safe in ephemeral disposable replay.
-- The legacy Telegram DDL files numbered 9993+ sort after timestamped files.
-- A second replay at 9996 below repeats these exact idempotent hardenings
-- AFTER the historical Telegram tables/functions have been created.
DO $guard$
BEGIN
  IF to_regclass('public.live_telegram_source_candidates') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.live_telegram_source_candidates ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public.live_telegram_source_candidates FROM PUBLIC, anon, authenticated';
  END IF;
  IF to_regclass('public.live_telegram_governance_status') IS NOT NULL THEN
    EXECUTE 'ALTER VIEW public.live_telegram_governance_status SET (security_invoker = true)';
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public.live_telegram_governance_status FROM PUBLIC, anon, authenticated';
  END IF;
  IF to_regprocedure('public.trg_sync_telegram_authorized_feed_source_state()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.trg_sync_telegram_authorized_feed_source_state() SET search_path = pg_catalog, public';
  END IF;
  IF to_regprocedure('public.enforce_telegram_flash_authorization()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.enforce_telegram_flash_authorization() SET search_path = pg_catalog, public';
  END IF;
  IF to_regprocedure('public.sync_telegram_authorized_feed_source_state()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.sync_telegram_authorized_feed_source_state() SET search_path = pg_catalog, public';
  END IF;
END
$guard$;
