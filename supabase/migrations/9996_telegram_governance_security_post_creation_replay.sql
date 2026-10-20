-- Disposable-database replay bridge: historical Telegram schema uses
-- migration numbers 9992..9995; therefore timestamped 20261020 hardening
-- may execute before it exists. This deliberately runs AFTER 9995.
-- All actions idempotent and already verified directly in production.
ALTER TABLE public.live_telegram_source_candidates ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.live_telegram_source_candidates FROM PUBLIC, anon, authenticated;
ALTER VIEW public.live_telegram_governance_status SET (security_invoker = true);
REVOKE ALL PRIVILEGES ON TABLE public.live_telegram_governance_status FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.trg_sync_telegram_authorized_feed_source_state()
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.enforce_telegram_flash_authorization()
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.sync_telegram_authorized_feed_source_state()
  SET search_path = pg_catalog, public;
