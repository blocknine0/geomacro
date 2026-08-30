-- =============================================================================
-- Geomacro GRI production proof + validation layer
-- Completes the public audit contract introduced in migration 004.
-- =============================================================================

ALTER TABLE public.gri_contributions ADD COLUMN IF NOT EXISTS classification_scored_at timestamptz;

ALTER TABLE public.gri_snapshots ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';
ALTER TABLE public.gri_snapshots ADD COLUMN IF NOT EXISTS proof_version text;
ALTER TABLE public.gri_snapshots ADD COLUMN IF NOT EXISTS evidence_hash text;
ALTER TABLE public.gri_snapshots ADD COLUMN IF NOT EXISTS proof_hash text;
ALTER TABLE public.gri_snapshots ADD COLUMN IF NOT EXISTS verification_status text;
ALTER TABLE public.gri_snapshots ADD COLUMN IF NOT EXISTS reconciliation_residual numeric(18,12);
ALTER TABLE public.gri_snapshots ADD COLUMN IF NOT EXISTS change_residual numeric(18,12);
ALTER TABLE public.gri_snapshots ADD COLUMN IF NOT EXISTS explanation jsonb;
ALTER TABLE public.gri_snapshots ADD COLUMN IF NOT EXISTS published_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gri_snapshot_status_check'
  ) THEN
    ALTER TABLE public.gri_snapshots
      ADD CONSTRAINT gri_snapshot_status_check
      CHECK (status IN ('draft', 'published'));
  END IF;
END $$;

-- Migration 004 may already have produced snapshots. Keep them readable, but
-- label them honestly because the stronger proof envelope did not yet exist.
UPDATE public.gri_snapshots
SET status = 'published',
    verification_status = COALESCE(verification_status, 'legacy-unverified'),
    published_at = COALESCE(published_at, created_at)
WHERE status = 'draft' AND created_at < now();

CREATE INDEX IF NOT EXISTS gri_snapshots_status_method_as_of_idx
  ON public.gri_snapshots (status, methodology_version, as_of DESC);

-- Public readers can only see complete publications. Draft rows exist only
-- while the server is writing and verifying the decomposition.
DROP POLICY IF EXISTS "gri_snapshots_anon_read" ON public.gri_snapshots;
CREATE POLICY "gri_snapshots_anon_read"
ON public.gri_snapshots FOR SELECT TO anon, authenticated
USING (status = 'published');

DROP POLICY IF EXISTS "gri_contributions_anon_read" ON public.gri_contributions;
CREATE POLICY "gri_contributions_anon_read"
ON public.gri_contributions FOR SELECT TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.gri_snapshots s
    WHERE s.id = snapshot_id AND s.status = 'published'
  )
);

-- Once published, snapshot metadata and its contribution ledger are immutable,
-- including to the service role. A correction must be a new snapshot/version.
CREATE OR REPLACE FUNCTION public.prevent_published_gri_snapshot_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'published' THEN
    RAISE EXCEPTION 'Published GRI snapshots are immutable';
  END IF;

  -- A draft may become public only after the complete stored proof package has
  -- passed verification. This is a database-level backstop in addition to the
  -- publisher's pre-publication recomputation/hash checks.
  IF TG_OP = 'UPDATE' AND NEW.status = 'published' THEN
    IF NEW.verification_status IS DISTINCT FROM 'verified'
       OR NEW.proof_version IS NULL
       OR NEW.proof_hash IS NULL
       OR NEW.evidence_hash IS NULL
       OR NEW.methodology_hash IS NULL
       OR NEW.input_hash IS NULL
       OR NEW.calculation_hash IS NULL
       OR NEW.published_at IS NULL
       OR (NEW.reconciliation_residual IS NOT NULL AND abs(NEW.reconciliation_residual) > 0.0000001)
       OR (NEW.change_residual IS NOT NULL AND abs(NEW.change_residual) > 0.0000001)
    THEN
      RAISE EXCEPTION 'GRI snapshot cannot be published before complete proof verification';
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS gri_snapshot_immutable_after_publish ON public.gri_snapshots;
CREATE TRIGGER gri_snapshot_immutable_after_publish
BEFORE UPDATE OR DELETE ON public.gri_snapshots
FOR EACH ROW EXECUTE FUNCTION public.prevent_published_gri_snapshot_mutation();

CREATE OR REPLACE FUNCTION public.prevent_published_gri_contribution_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status text;
DECLARE parent_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    parent_id := NEW.snapshot_id;
  ELSE
    parent_id := OLD.snapshot_id;
  END IF;

  SELECT status INTO parent_status
  FROM public.gri_snapshots
  WHERE id = parent_id;
  IF parent_status = 'published' THEN
    RAISE EXCEPTION 'Contributions of a published GRI snapshot are immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS gri_contribution_immutable_after_publish ON public.gri_contributions;
CREATE TRIGGER gri_contribution_immutable_after_publish
BEFORE INSERT OR UPDATE OR DELETE ON public.gri_contributions
FOR EACH ROW EXECUTE FUNCTION public.prevent_published_gri_contribution_mutation();

-- -----------------------------------------------------------------------------
-- Empirical validation layer. It never changes the live GRI calculation.
-- Benchmark observations are append-only inputs used to test whether GRI has
-- stable relationships with external variables. Results must be published
-- explicitly and never inferred from incomplete data.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gri_benchmark_definitions (
  benchmark_key text PRIMARY KEY,
  display_name text NOT NULL,
  source_name text NOT NULL,
  source_series_id text,
  transformation text NOT NULL CHECK (transformation IN ('difference', 'pct_return')),
  risk_direction smallint CHECK (risk_direction IN (-1, 1)),
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.gri_benchmark_definitions
  (benchmark_key, display_name, source_name, source_series_id, transformation, risk_direction, notes)
VALUES
  ('vix', 'CBOE Volatility Index', 'FRED', 'VIXCLS', 'difference', 1, 'Higher levels generally represent higher equity-market stress.'),
  ('us30y', 'US 30-Year Treasury Yield', 'FRED', 'DGS30', 'difference', NULL, 'Relationship is empirical; no fixed causal direction is asserted.'),
  ('wti', 'WTI Crude Oil', 'FRED', 'DCOILWTICO', 'pct_return', NULL, 'Useful for event studies; direction depends on the shock type.'),
  ('gold', 'Gold Fixing Price', 'FRED', 'GOLDAMGBD228NLBM', 'pct_return', NULL, 'Safe-haven relationship is tested rather than assumed.'),
  ('sp500', 'S&P 500', 'FRED', 'SP500', 'pct_return', -1, 'Negative equity returns are treated as the risk-aligned direction.'),
  ('broad_usd', 'Nominal Broad U.S. Dollar Index', 'FRED', 'DTWEXBGS', 'pct_return', NULL, 'Broad USD proxy; not labelled DXY.')
ON CONFLICT (benchmark_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.gri_benchmark_observations (
  id bigint generated always as identity PRIMARY KEY,
  benchmark_key text NOT NULL REFERENCES public.gri_benchmark_definitions(benchmark_key),
  observed_at timestamptz NOT NULL,
  value numeric NOT NULL,
  source_name text NOT NULL,
  source_url text,
  source_series_id text,
  input_hash text NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (benchmark_key, observed_at)
);
CREATE INDEX IF NOT EXISTS gri_benchmark_key_time_idx
  ON public.gri_benchmark_observations (benchmark_key, observed_at);

CREATE TABLE IF NOT EXISTS public.gri_validation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  methodology_version text NOT NULL,
  validation_version text NOT NULL,
  evidence_mode text NOT NULL DEFAULT 'live_oos' CHECK (evidence_mode IN ('live_oos', 'retrospective_replay')),
  source_replay_run_id uuid,
  status text NOT NULL CHECK (status IN ('insufficient_data', 'completed', 'failed')),
  sample_start timestamptz,
  sample_end timestamptz,
  sample_count integer NOT NULL DEFAULT 0,
  benchmark_count integer NOT NULL DEFAULT 0,
  train_fraction numeric(6,5),
  result_hash text,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE INDEX IF NOT EXISTS gri_validation_runs_method_created_idx
  ON public.gri_validation_runs (methodology_version, created_at DESC);

CREATE TABLE IF NOT EXISTS public.gri_validation_metrics (
  validation_run_id uuid NOT NULL REFERENCES public.gri_validation_runs(id) ON DELETE CASCADE,
  benchmark_key text NOT NULL REFERENCES public.gri_benchmark_definitions(benchmark_key),
  horizon_hours integer NOT NULL CHECK (horizon_hours > 0),
  split text NOT NULL CHECK (split IN ('all', 'train', 'test')),
  sample_count integer NOT NULL,
  pearson_r numeric,
  delta_pearson_p_approx numeric,
  spearman_rho numeric,
  delta_pearson_r numeric,
  direction_hit_rate numeric,
  high_risk_event_count integer,
  false_positive_rate numeric,
  event_study_high_mean_z numeric,
  event_study_baseline_mean_z numeric,
  event_study_effect_z numeric,
  notes text,
  PRIMARY KEY (validation_run_id, benchmark_key, horizon_hours, split)
);

-- Retrospective historical replay is deliberately isolated from live published
-- GRI snapshots. It uses publisher timestamps as a historical observation proxy
-- and is therefore calibration evidence, never proof that Geomacro produced the
-- score in real time.
CREATE TABLE IF NOT EXISTS public.gri_replay_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  methodology_version text NOT NULL,
  replay_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'published')),
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  cadence_hours integer NOT NULL CHECK (cadence_hours > 0),
  observation_time_rule text NOT NULL DEFAULT 'published_at_retrospective',
  lookahead_safe boolean NOT NULL DEFAULT false,
  snapshot_count integer NOT NULL DEFAULT 0,
  result_hash text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.gri_replay_snapshots (
  replay_run_id uuid NOT NULL REFERENCES public.gri_replay_runs(id) ON DELETE CASCADE,
  as_of timestamptz NOT NULL,
  raw_score numeric(10,6),
  display_score smallint,
  coverage numeric(8,6) NOT NULL DEFAULT 0,
  weighted_confidence numeric(10,6),
  event_count integer NOT NULL DEFAULT 0,
  source_count integer NOT NULL DEFAULT 0,
  category_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  methodology_hash text NOT NULL,
  input_hash text NOT NULL,
  evidence_hash text NOT NULL,
  calculation_hash text NOT NULL,
  PRIMARY KEY (replay_run_id, as_of),
  CONSTRAINT gri_replay_display_score_range CHECK (display_score IS NULL OR display_score BETWEEN 0 AND 100),
  CONSTRAINT gri_replay_coverage_range CHECK (coverage BETWEEN 0 AND 1)
);
CREATE INDEX IF NOT EXISTS gri_replay_snapshots_run_time_idx
  ON public.gri_replay_snapshots (replay_run_id, as_of);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gri_validation_replay_fk') THEN
    ALTER TABLE public.gri_validation_runs
      ADD CONSTRAINT gri_validation_replay_fk
      FOREIGN KEY (source_replay_run_id) REFERENCES public.gri_replay_runs(id);
  END IF;
END $$;

ALTER TABLE public.gri_benchmark_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gri_benchmark_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gri_validation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gri_validation_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gri_replay_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gri_replay_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gri_benchmark_definitions_anon_read" ON public.gri_benchmark_definitions;
CREATE POLICY "gri_benchmark_definitions_anon_read"
ON public.gri_benchmark_definitions FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "gri_benchmark_anon_read" ON public.gri_benchmark_observations;
CREATE POLICY "gri_benchmark_anon_read"
ON public.gri_benchmark_observations FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "gri_validation_runs_anon_read" ON public.gri_validation_runs;
CREATE POLICY "gri_validation_runs_anon_read"
ON public.gri_validation_runs FOR SELECT TO anon, authenticated USING (published_at IS NOT NULL);

DROP POLICY IF EXISTS "gri_validation_metrics_anon_read" ON public.gri_validation_metrics;
CREATE POLICY "gri_validation_metrics_anon_read"
ON public.gri_validation_metrics FOR SELECT TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.gri_validation_runs r
    WHERE r.id = validation_run_id AND r.published_at IS NOT NULL
  )
);

DROP POLICY IF EXISTS "gri_replay_runs_anon_read" ON public.gri_replay_runs;
CREATE POLICY "gri_replay_runs_anon_read"
ON public.gri_replay_runs FOR SELECT TO anon, authenticated USING (status = 'published');

DROP POLICY IF EXISTS "gri_replay_snapshots_anon_read" ON public.gri_replay_snapshots;
CREATE POLICY "gri_replay_snapshots_anon_read"
ON public.gri_replay_snapshots FOR SELECT TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.gri_replay_runs r
    WHERE r.id = replay_run_id AND r.status = 'published'
  )
);

-- Benchmark inputs are append-only; published validation/replay outputs are
-- immutable. Re-running a test creates a new run rather than rewriting history.
CREATE OR REPLACE FUNCTION public.prevent_gri_benchmark_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'GRI benchmark observations are append-only';
END;
$$;
DROP TRIGGER IF EXISTS gri_benchmark_immutable ON public.gri_benchmark_observations;
CREATE TRIGGER gri_benchmark_immutable
BEFORE UPDATE OR DELETE ON public.gri_benchmark_observations
FOR EACH ROW EXECUTE FUNCTION public.prevent_gri_benchmark_mutation();

CREATE OR REPLACE FUNCTION public.prevent_published_gri_validation_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.published_at IS NOT NULL THEN
    RAISE EXCEPTION 'Published GRI validation runs are immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
DROP TRIGGER IF EXISTS gri_validation_run_immutable ON public.gri_validation_runs;
CREATE TRIGGER gri_validation_run_immutable
BEFORE UPDATE OR DELETE ON public.gri_validation_runs
FOR EACH ROW EXECUTE FUNCTION public.prevent_published_gri_validation_mutation();

CREATE OR REPLACE FUNCTION public.prevent_published_gri_validation_metric_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE run_published_at timestamptz;
DECLARE run_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN run_id := NEW.validation_run_id; ELSE run_id := OLD.validation_run_id; END IF;
  SELECT published_at INTO run_published_at FROM public.gri_validation_runs WHERE id = run_id;
  IF run_published_at IS NOT NULL THEN
    RAISE EXCEPTION 'Metrics of a published GRI validation run are immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
DROP TRIGGER IF EXISTS gri_validation_metric_immutable ON public.gri_validation_metrics;
CREATE TRIGGER gri_validation_metric_immutable
BEFORE INSERT OR UPDATE OR DELETE ON public.gri_validation_metrics
FOR EACH ROW EXECUTE FUNCTION public.prevent_published_gri_validation_metric_mutation();

CREATE OR REPLACE FUNCTION public.prevent_published_gri_replay_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'published' THEN
    RAISE EXCEPTION 'Published GRI replay runs are immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
DROP TRIGGER IF EXISTS gri_replay_run_immutable ON public.gri_replay_runs;
CREATE TRIGGER gri_replay_run_immutable
BEFORE UPDATE OR DELETE ON public.gri_replay_runs
FOR EACH ROW EXECUTE FUNCTION public.prevent_published_gri_replay_mutation();

CREATE OR REPLACE FUNCTION public.prevent_published_gri_replay_snapshot_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE run_status text;
DECLARE run_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN run_id := NEW.replay_run_id; ELSE run_id := OLD.replay_run_id; END IF;
  SELECT status INTO run_status FROM public.gri_replay_runs WHERE id = run_id;
  IF run_status = 'published' THEN
    RAISE EXCEPTION 'Snapshots of a published GRI replay run are immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
DROP TRIGGER IF EXISTS gri_replay_snapshot_immutable ON public.gri_replay_snapshots;
CREATE TRIGGER gri_replay_snapshot_immutable
BEFORE INSERT OR UPDATE OR DELETE ON public.gri_replay_snapshots
FOR EACH ROW EXECUTE FUNCTION public.prevent_published_gri_replay_snapshot_mutation();

COMMENT ON TABLE public.gri_validation_runs IS
  'Empirical GRI validation only. A completed run does not imply causality or predictive power; inspect metrics and test split.';
