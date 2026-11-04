-- Seven-day country signal rollups and named-corridor candidate gate state.
-- Private service-role writes only; scores remain labelled VERIFIED or OBSERVED.
BEGIN;

-- These two derived tables existed in the production project before they
-- were represented in the repository's replayable migration history. Create
-- their canonical base shape when replaying from zero; on production this is
-- a no-op and the ALTER statements below evolve the existing tables.
CREATE TABLE IF NOT EXISTS public.geomacro_risk_signal_7d (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_sha256 text NOT NULL UNIQUE CHECK (event_sha256 ~ '^[a-f0-9]{64}$'),
  verified_gro_sha256 text CHECK (verified_gro_sha256 IS NULL OR verified_gro_sha256 ~ '^[a-f0-9]{64}$'),
  country_iso3 text NOT NULL CHECK (country_iso3 ~ '^[A-Z]{3}$'),
  domain text NOT NULL CHECK (domain IN ('geopolitics','macro_fx','critical_minerals')),
  signal_kind text NOT NULL CHECK (signal_kind ~ '^[a-z_]{1,64}$'),
  intensity numeric(5,2) NOT NULL CHECK (intensity BETWEEN 0 AND 100),
  verification_status text NOT NULL DEFAULT 'VERIFIED'
    CHECK (verification_status IN ('VERIFIED','OBSERVED_UNVERIFIED','NO_VERIFIED_SIGNAL')),
  original_at timestamptz NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_sha256,country_iso3,domain)
);

CREATE TABLE IF NOT EXISTS public.geomacro_corridor_candidate_7d (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  candidate_sha256 text NOT NULL UNIQUE CHECK (candidate_sha256 ~ '^[a-f0-9]{64}$'),
  origin_country_iso3 text CHECK (origin_country_iso3 IS NULL OR origin_country_iso3 ~ '^[A-Z]{3}$'),
  destination_country_iso3 text CHECK (destination_country_iso3 IS NULL OR destination_country_iso3 ~ '^[A-Z]{3}$'),
  evidence_gro_sha256 text CHECK (evidence_gro_sha256 IS NULL OR evidence_gro_sha256 ~ '^[a-f0-9]{64}$'),
  candidate_status text NOT NULL DEFAULT 'UNSCORED'
    CHECK (candidate_status IN ('UNSCORED','REJECTED','VERIFIED_EXPOSURE','CONDITIONAL_PASS','REQUIRES_SIGNED_GRO')),
  exposure_kind text NOT NULL CHECK (exposure_kind ~ '^[a-z_]{1,64}$'),
  ingested_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.geomacro_risk_signal_7d
  ADD COLUMN IF NOT EXISTS score_0_100 numeric(5,2),
  ADD COLUMN IF NOT EXISTS rolling_7d_avg_0_100 numeric(5,2),
  ADD COLUMN IF NOT EXISTS volatility_7d_0_100 numeric(5,2),
  ADD COLUMN IF NOT EXISTS risk_delta_0_100 numeric(6,2),
  ADD COLUMN IF NOT EXISTS rollup_day date,
  ADD COLUMN IF NOT EXISTS scored_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_snapshot_sha256 text;
ALTER TABLE public.geomacro_risk_signal_7d
  ALTER COLUMN verified_gro_sha256 DROP NOT NULL;
ALTER TABLE public.geomacro_risk_signal_7d
  DROP CONSTRAINT IF EXISTS geomacro_risk_signal_7d_verification_status_check;
ALTER TABLE public.geomacro_risk_signal_7d
  ADD CONSTRAINT geomacro_risk_signal_7d_verification_status_check
    CHECK (verification_status IN ('VERIFIED','OBSERVED_UNVERIFIED','NO_VERIFIED_SIGNAL'));
ALTER TABLE public.geomacro_risk_signal_7d
  ADD CONSTRAINT geomacro_risk_signal_7d_verified_gro_presence_check
    CHECK ((verification_status='VERIFIED' AND verified_gro_sha256 IS NOT NULL)
       OR (verification_status<>'VERIFIED' AND verified_gro_sha256 IS NULL));
ALTER TABLE public.geomacro_risk_signal_7d
  ADD CONSTRAINT geomacro_risk_signal_7d_rollup_values_check
    CHECK ((score_0_100 IS NULL OR score_0_100 BETWEEN 0 AND 100)
       AND (rolling_7d_avg_0_100 IS NULL OR rolling_7d_avg_0_100 BETWEEN 0 AND 100)
       AND (volatility_7d_0_100 IS NULL OR volatility_7d_0_100 BETWEEN 0 AND 100)
       AND (risk_delta_0_100 IS NULL OR risk_delta_0_100 BETWEEN -100 AND 100)
       AND scored_days BETWEEN 0 AND 7);
CREATE INDEX IF NOT EXISTS idx_geomacro_risk_signal_7d_rollup_day
 ON public.geomacro_risk_signal_7d(country_iso3,domain,rollup_day DESC);

ALTER TABLE public.geomacro_corridor_candidate_7d
  ALTER COLUMN origin_country_iso3 DROP NOT NULL,
  ALTER COLUMN destination_country_iso3 DROP NOT NULL,
  ALTER COLUMN evidence_gro_sha256 DROP NOT NULL;
ALTER TABLE public.geomacro_corridor_candidate_7d
  DROP CONSTRAINT IF EXISTS geomacro_corridor_candidate_7d_candidate_status_check;
ALTER TABLE public.geomacro_corridor_candidate_7d
  ADD CONSTRAINT geomacro_corridor_candidate_7d_candidate_status_check
    CHECK (candidate_status IN ('UNSCORED','REJECTED','VERIFIED_EXPOSURE',
      'CONDITIONAL_PASS','REQUIRES_SIGNED_GRO'));
ALTER TABLE public.geomacro_corridor_candidate_7d
  ADD COLUMN IF NOT EXISTS corridor_id text,
  ADD COLUMN IF NOT EXISTS day_utc date,
  ADD COLUMN IF NOT EXISTS friction_index_0_100 numeric(5,2),
  ADD COLUMN IF NOT EXISTS rolling_7d_avg_0_100 numeric(5,2),
  ADD COLUMN IF NOT EXISTS volatility_7d_0_100 numeric(5,2),
  ADD COLUMN IF NOT EXISTS risk_delta_0_100 numeric(6,2),
  ADD COLUMN IF NOT EXISTS constituent_countries jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS weighting_method text NOT NULL DEFAULT 'UNSET',
  ADD COLUMN IF NOT EXISTS evidence_completeness text NOT NULL DEFAULT 'INCOMPLETE',
  ADD COLUMN IF NOT EXISTS basic_tier_status text NOT NULL DEFAULT 'CONDITIONAL_PASS',
  ADD COLUMN IF NOT EXISTS full_tier_status text NOT NULL DEFAULT 'REQUIRES_SIGNED_GRO',
  ADD COLUMN IF NOT EXISTS source_snapshot_sha256 text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.geomacro_corridor_candidate_7d
  ADD CONSTRAINT geomacro_corridor_candidate_7d_corridor_gate_values_check
    CHECK ((corridor_id IS NULL OR corridor_id ~ '^[a-z0-9-]{2,64}$')
       AND (friction_index_0_100 IS NULL OR friction_index_0_100 BETWEEN 0 AND 100)
       AND (rolling_7d_avg_0_100 IS NULL OR rolling_7d_avg_0_100 BETWEEN 0 AND 100)
       AND (volatility_7d_0_100 IS NULL OR volatility_7d_0_100 BETWEEN 0 AND 100)
       AND (risk_delta_0_100 IS NULL OR risk_delta_0_100 BETWEEN -100 AND 100)
       AND jsonb_typeof(constituent_countries)='array'
       AND weighting_method IN ('EQUAL_COUNTRY_WEIGHTS_UNVERIFIED','NO_MEMBER_MAPPING')
       AND evidence_completeness IN ('COMPLETE','INCOMPLETE','NO_MEMBER_MAPPING')
       AND basic_tier_status='CONDITIONAL_PASS'
       AND full_tier_status='REQUIRES_SIGNED_GRO'
       AND (expires_at IS NULL OR expires_at<=ingested_at+interval '7 days'));
DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='geomacro_corridor_candidate_7d_corridor_day_key') THEN
    ALTER TABLE public.geomacro_corridor_candidate_7d
      ADD CONSTRAINT geomacro_corridor_candidate_7d_corridor_day_key UNIQUE(corridor_id,day_utc);
  END IF;
END $migration$;
CREATE INDEX IF NOT EXISTS idx_geomacro_corridor_candidate_7d_expiry
 ON public.geomacro_corridor_candidate_7d(expires_at);

ALTER TABLE public.geomacro_risk_signal_7d ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geomacro_risk_signal_7d FORCE ROW LEVEL SECURITY;
ALTER TABLE public.geomacro_corridor_candidate_7d ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geomacro_corridor_candidate_7d FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.geomacro_risk_signal_7d FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.geomacro_corridor_candidate_7d FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.geomacro_risk_signal_7d TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.geomacro_corridor_candidate_7d TO service_role;
COMMIT;
