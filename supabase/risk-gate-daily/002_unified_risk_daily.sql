-- Apply only in the existing, owner-approved private supplementary Supabase project.
CREATE TABLE IF NOT EXISTS public.geomacro_unified_risk_daily (
 entity_type text NOT NULL CHECK(entity_type IN ('COUNTRY','CORRIDOR')),
 entity_id text NOT NULL,
 day_utc date NOT NULL,
 snapshot jsonb NOT NULL,
 audit_proof jsonb NOT NULL,
 content_sha256 text NOT NULL CHECK(content_sha256 ~ '^[0-9a-f]{64}$'),
 generated_at timestamptz NOT NULL,
 PRIMARY KEY(entity_type,entity_id,day_utc)
);
CREATE INDEX IF NOT EXISTS geomacro_unified_risk_daily_generated_idx
 ON public.geomacro_unified_risk_daily(generated_at);
ALTER TABLE public.geomacro_unified_risk_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.geomacro_unified_risk_daily FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.geomacro_unified_risk_daily TO service_role;
