BEGIN;

-- ============================================================
-- Immutable GRI event reclassification ledger
--
-- Purpose:
--   Preserve the original public.events row and all historical
--   published GRI proofs while allowing a later classifier
--   contract to reassess the exact same source event.
--
-- public.events.source_url remains globally UNIQUE.
-- No duplicate product/market event is created.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.gri_event_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  event_id uuid NOT NULL
    REFERENCES public.events(id)
    ON DELETE RESTRICT,

  category text NOT NULL
    CHECK (category IN ('geopolitics', 'macro', 'rare_earth', 'crypto')),

  severity integer NOT NULL
    CHECK (severity BETWEEN 0 AND 100),

  confidence integer NOT NULL
    CHECK (confidence BETWEEN 0 AND 100),

  narrative text NOT NULL,
  summary text NOT NULL,

  classification_provider text NOT NULL,
  classification_model text NOT NULL,
  classification_version text NOT NULL,
  classification_prompt_version text NOT NULL,
  classification_scored_at timestamptz NOT NULL,
  classification_input_hash text NOT NULL
    CHECK (classification_input_hash ~ '^[0-9a-fA-F]{64}$'),

  prior_category text NOT NULL,
  prior_classification_version text NOT NULL,
  prior_classification_prompt_version text,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT gri_event_assessments_event_contract_key
    UNIQUE (
      event_id,
      classification_version,
      classification_prompt_version
    )
);

CREATE INDEX IF NOT EXISTS idx_gri_event_assessments_event
  ON public.gri_event_assessments(event_id);

CREATE INDEX IF NOT EXISTS idx_gri_event_assessments_contract
  ON public.gri_event_assessments(
    classification_version,
    classification_prompt_version
  );

CREATE INDEX IF NOT EXISTS idx_gri_event_assessments_scored_at
  ON public.gri_event_assessments(classification_scored_at DESC);

ALTER TABLE public.gri_event_assessments ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated write policy.
-- Production server/service-role performs controlled inserts.
-- Published public proof continues to come from gri_snapshots /
-- gri_contributions rather than this internal reassessment ledger.

CREATE OR REPLACE FUNCTION public.prevent_gri_event_assessment_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'gri_event_assessments is immutable: UPDATE/DELETE is not permitted';
END;
$$;

DROP TRIGGER IF EXISTS trg_gri_event_assessments_immutable
  ON public.gri_event_assessments;

CREATE TRIGGER trg_gri_event_assessments_immutable
BEFORE UPDATE OR DELETE
ON public.gri_event_assessments
FOR EACH ROW
EXECUTE FUNCTION public.prevent_gri_event_assessment_mutation();

COMMIT;
