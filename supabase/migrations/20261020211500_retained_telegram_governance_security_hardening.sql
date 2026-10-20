-- Safe interim hardening of old Supabase Telegram governance until owner-
-- verified D1/B2 retirement. No data deletion, source activation or payment.
-- Former public table carried anon/authenticated ALL privileges with RLS OFF.
-- Internal governance audit uses privileged service role; no public callers.
ALTER TABLE public.live_telegram_source_candidates ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.live_telegram_source_candidates FROM PUBLIC, anon, authenticated;

-- This view reports aggregate governance state; the old security-definer
-- setting can bypass caller row-level security. Its audit use is private.
ALTER VIEW public.live_telegram_governance_status SET (security_invoker = true);
REVOKE ALL PRIVILEGES ON TABLE public.live_telegram_governance_status FROM PUBLIC, anon, authenticated;

-- Trusted, explicitly scoped built-in and public schema search paths.
-- The functions use schema-qualified tables and pg_catalog built-ins.
ALTER FUNCTION public.trg_sync_telegram_authorized_feed_source_state()
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.enforce_telegram_flash_authorization()
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.sync_telegram_authorized_feed_source_state()
  SET search_path = pg_catalog, public;
