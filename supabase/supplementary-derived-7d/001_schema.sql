-- Apply ONLY to a NEW supplementary Supabase project, never historical data.
CREATE TABLE IF NOT EXISTS public.geomacro_corridor_derived_7d(
 id text PRIMARY KEY CHECK(id ~ '^[a-f0-9]{64}$'),
 analysis_sha256 text NOT NULL CHECK(analysis_sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 structured_json jsonb NOT NULL CHECK(jsonb_typeof(structured_json)='object'),
 verified_event boolean NOT NULL DEFAULT false CHECK(verified_event=false),
 commercial_ready boolean NOT NULL DEFAULT false CHECK(commercial_ready=false),
 risk_gate_ready boolean NOT NULL DEFAULT false CHECK(risk_gate_ready=false),
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '7 days')
);
CREATE INDEX IF NOT EXISTS idx_geomacro_corridor_7d_ttl
 ON public.geomacro_corridor_derived_7d(expires_at);
ALTER TABLE public.geomacro_corridor_derived_7d ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geomacro_corridor_derived_7d FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.geomacro_corridor_derived_7d FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.geomacro_corridor_derived_7d TO service_role;
-- No browser/customer policies. Service-role only. The Worker deletes expired rows.
