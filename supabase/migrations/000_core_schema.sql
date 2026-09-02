-- =============================================================================
-- Geomacro canonical core schema baseline
--
-- Purpose:
--   * Make a fresh database capable of running migrations 001+ from zero.
--   * Capture the historically-manual core events/dispute schema in Git.
--   * Be safe on the existing production database: CREATE IF NOT EXISTS and
--     guarded constraint/policy creation only; no DROP/TRUNCATE/data rewrites.
--
-- Production rule: this migration is additive/idempotent. Never use db reset
-- against production. Normal production changes are forward-only migrations.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url text NOT NULL,
  source_title text NOT NULL,
  source_name text,
  category text NOT NULL,
  narrative text NOT NULL,
  summary text NOT NULL,
  stage text NOT NULL,
  severity integer NOT NULL,
  confidence integer NOT NULL,
  delta integer NOT NULL,
  published_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  market_created boolean DEFAULT false,
  market_threshold integer,
  resolution_at timestamptz,
  market_resolved boolean DEFAULT false,
  url text,
  title text,
  description text,
  ai_processed boolean DEFAULT false,
  ai_tentative_winner text,
  ai_resolved_at timestamptz,
  market_address text,
  lifecycle_stage text NOT NULL DEFAULT 'active',
  disputer_address text,
  disputed_at timestamptz,
  dispute_window_ends_at timestamptz,
  market_created_tx_hash text,
  ai_reasoning text,
  hawk_reasoning text,
  dove_reasoning text,
  hawk_conviction smallint,
  dove_conviction smallint,
  briefing_generated_at timestamptz,
  market_question text,
  source_domain text,
  classification_provider text,
  classification_model text,
  classification_version text,
  classification_prompt_version text,
  classification_scored_at timestamptz,
  classification_input_hash text,
  CONSTRAINT events_source_url_key UNIQUE (source_url)
);

-- Current application lifecycle contract. Guarded so production's existing
-- named constraints remain untouched.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.events'::regclass
      AND conname = 'events_lifecycle_stage_check'
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_lifecycle_stage_check
      CHECK (lifecycle_stage IN ('active', 'awaiting_dispute', 'disputed', 'completed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.events'::regclass
      AND conname = 'chk_completed_implies_resolved'
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT chk_completed_implies_resolved
      CHECK (lifecycle_stage <> 'completed' OR market_resolved = true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.events'::regclass
      AND conname = 'chk_resolved_implies_ai_processed'
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT chk_resolved_implies_ai_processed
      CHECK (market_resolved IS NOT TRUE OR ai_processed = true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS events_lifecycle_stage_idx
  ON public.events (lifecycle_stage);
CREATE INDEX IF NOT EXISTS idx_events_lifecycle_market_created
  ON public.events (market_created, lifecycle_stage)
  WHERE market_created = true;
CREATE INDEX IF NOT EXISTS idx_events_resolution_due
  ON public.events (resolution_at)
  WHERE market_created = true AND market_resolved = false;

-- Canonical live dispute shape. Creating this before migration 001 neutralizes
-- migration 001's obsolete bigint CREATE TABLE branch; its ADD COLUMN IF NOT
-- EXISTS statements then remain harmless/additive.
CREATE TABLE IF NOT EXISTS public.market_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id),
  market_id text NOT NULL,
  disputer_address text NOT NULL,
  dispute_tx_hash text,
  disputed_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  outcome text,
  created_at timestamptz NOT NULL DEFAULT now(),
  bond_amount numeric,
  overturn_votes smallint NOT NULL DEFAULT 0,
  uphold_votes smallint NOT NULL DEFAULT 0,
  resolved boolean NOT NULL DEFAULT false,
  final_verdict text
);

CREATE UNIQUE INDEX IF NOT EXISTS market_disputes_market_id_idx
  ON public.market_disputes (market_id);
CREATE INDEX IF NOT EXISTS market_disputes_resolved_idx
  ON public.market_disputes (resolved);

CREATE TABLE IF NOT EXISTS public.jury_votes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  market_id text NOT NULL,
  juror_role text NOT NULL,
  juror_wallet text NOT NULL,
  verdict text NOT NULL,
  reasoning text,
  tx_hash text NOT NULL,
  voted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id, juror_wallet)
);
CREATE INDEX IF NOT EXISTS jury_votes_market_id_idx
  ON public.jury_votes (market_id);

-- Public transparency reads are intentional for these three surfaces. No anon
-- write policies are created. Service-role server processes remain writers.
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jury_votes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'events'
      AND policyname = 'Geomacro public events read'
  ) THEN
    CREATE POLICY "Geomacro public events read"
      ON public.events FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'market_disputes'
      AND policyname = 'Geomacro public disputes read'
  ) THEN
    CREATE POLICY "Geomacro public disputes read"
      ON public.market_disputes FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'jury_votes'
      AND policyname = 'Geomacro public jury votes read'
  ) THEN
    CREATE POLICY "Geomacro public jury votes read"
      ON public.jury_votes FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;
