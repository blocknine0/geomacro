-- New dedicated Supabase project ONLY; apply after 001 and enable pg_cron extension.
select cron.schedule(
  'geomacro-risk-buffer-seven-day-hourly',
  '7 * * * *',
  $job$select public.geomacro_purge_risk_buffer_7d();$job$
);
-- Monitor cron.job and cron.job_run_details; missed Free-tier runs are not guaranteed.
