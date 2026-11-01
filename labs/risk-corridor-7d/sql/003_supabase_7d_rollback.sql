-- Explicit OWNER-ONLY ROLLBACK. New isolated Supabase project ONLY.
-- Never run against existing GeoMacro projects. Destructive; do not automate.
-- select cron.unschedule('geomacro-risk-buffer-seven-day-hourly');
drop function if exists public.geomacro_purge_risk_buffer_7d();
drop table if exists public.geomacro_risk_assessment_7d;
drop table if exists public.geomacro_corridor_candidate_7d;
drop table if exists public.geomacro_risk_signal_7d;
drop table if exists public.geomacro_buffer_operational_state;
