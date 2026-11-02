-- Run only in the NEW private Supabase project designated for daily Risk Gate snapshots.
-- Distinct from the existing supplementary seven-day project unless the owner elects otherwise.
CREATE TABLE IF NOT EXISTS public.geomacro_daily_tiered_risk_gates (
  corridor_id text NOT NULL,
  day_utc date NOT NULL,
  core_tier jsonb NOT NULL,
  signal_tier jsonb NOT NULL,
  policy_tier jsonb NOT NULL,
  observation jsonb NOT NULL,
  audit_proof jsonb NOT NULL,
  content_sha256 text NOT NULL CHECK(content_sha256 ~ '^[0-9a-f]{64}$'),
  generated_at timestamptz NOT NULL,
  PRIMARY KEY (corridor_id,day_utc)
);
CREATE INDEX IF NOT EXISTS geomacro_daily_tiered_risk_gates_time_idx
 ON public.geomacro_daily_tiered_risk_gates(generated_at);
ALTER TABLE public.geomacro_daily_tiered_risk_gates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.geomacro_daily_tiered_risk_gates FROM anon,authenticated;
-- service_role accesses the table through server-only REST; never expose this key to browser.
GRANT ALL ON public.geomacro_daily_tiered_risk_gates TO service_role;
