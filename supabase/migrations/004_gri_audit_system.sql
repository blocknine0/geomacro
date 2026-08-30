-- =============================================================================
-- Geomacro Global Risk Index (GRI) audit system — methodology v1.0.0
--
-- Adds immutable classification provenance to events and persisted GRI
-- snapshots/contributions. Public read is intentional; writes remain service-role
-- only so published scores can be independently inspected without exposing a
-- public mutation surface.
-- =============================================================================

-- Event-level model/provenance metadata. Existing rows are preserved and marked
-- legacy where exact historical provider/model metadata is unavailable.
ALTER TABLE events ADD COLUMN IF NOT EXISTS source_domain text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS classification_provider text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS classification_model text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS classification_version text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS classification_prompt_version text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS classification_scored_at timestamptz;
ALTER TABLE events ADD COLUMN IF NOT EXISTS classification_input_hash text;

UPDATE events
SET classification_version = 'legacy-unversioned'
WHERE classification_version IS NULL;

-- One row per published calculation. score is kept at high precision while
-- display_score is the integer exposed by compact UI surfaces.
CREATE TABLE IF NOT EXISTS public.gri_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  as_of timestamptz NOT NULL UNIQUE,
  methodology_version text NOT NULL,
  methodology_hash text NOT NULL,
  input_hash text NOT NULL,
  calculation_hash text NOT NULL,
  raw_score numeric(10,6),
  display_score smallint,
  coverage numeric(8,6) NOT NULL DEFAULT 0,
  weighted_confidence numeric(10,6),
  active_categories text[] NOT NULL DEFAULT '{}',
  event_count integer NOT NULL DEFAULT 0,
  source_count integer NOT NULL DEFAULT 0,
  category_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  previous_snapshot_id uuid REFERENCES public.gri_snapshots(id),
  previous_as_of timestamptz,
  previous_raw_score numeric(10,6),
  previous_display_score smallint,
  change_points numeric(10,6),
  change_hash text,
  change_attribution jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gri_display_score_range CHECK (display_score IS NULL OR display_score BETWEEN 0 AND 100),
  CONSTRAINT gri_coverage_range CHECK (coverage BETWEEN 0 AND 1)
);

CREATE INDEX IF NOT EXISTS gri_snapshots_as_of_idx ON public.gri_snapshots (as_of DESC);
CREATE INDEX IF NOT EXISTS gri_snapshots_method_idx ON public.gri_snapshots (methodology_version, as_of DESC);

-- Exact event-level decomposition for every snapshot. contribution_points sums
-- to raw_score (allowing only normal floating-point/storage rounding).
CREATE TABLE IF NOT EXISTS public.gri_contributions (
  snapshot_id uuid NOT NULL REFERENCES public.gri_snapshots(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  category text NOT NULL,
  source_key text NOT NULL,
  source_name text,
  source_domain text,
  source_url text,
  source_title text,
  summary text,
  severity numeric(10,6) NOT NULL,
  confidence numeric(10,6) NOT NULL,
  observed_at timestamptz NOT NULL,
  published_at timestamptz,
  age_hours numeric(12,6) NOT NULL,
  confidence_weight numeric(14,10) NOT NULL,
  decay_weight numeric(14,10) NOT NULL,
  raw_weight numeric(14,10) NOT NULL,
  effective_event_weight numeric(14,10) NOT NULL,
  source_effective_weight numeric(14,10) NOT NULL,
  category_effective_weight numeric(14,10) NOT NULL,
  normalized_category_weight numeric(14,10) NOT NULL,
  within_category_share numeric(14,10) NOT NULL,
  global_share numeric(14,10) NOT NULL,
  contribution_points numeric(14,8) NOT NULL,
  classification_provider text,
  classification_model text,
  classification_version text,
  classification_prompt_version text,
  classification_input_hash text,
  PRIMARY KEY (snapshot_id, event_id)
);

CREATE INDEX IF NOT EXISTS gri_contributions_event_idx ON public.gri_contributions (event_id);
CREATE INDEX IF NOT EXISTS gri_contributions_category_idx ON public.gri_contributions (snapshot_id, category);

ALTER TABLE public.gri_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gri_contributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gri_snapshots_anon_read" ON public.gri_snapshots;
CREATE POLICY "gri_snapshots_anon_read"
ON public.gri_snapshots FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "gri_contributions_anon_read" ON public.gri_contributions;
CREATE POLICY "gri_contributions_anon_read"
ON public.gri_contributions FOR SELECT TO anon USING (true);

-- No anon INSERT/UPDATE/DELETE policies. The service role bypasses RLS and is
-- the only writer used by scripts/compute-gri.js.
