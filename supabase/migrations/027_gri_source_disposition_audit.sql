BEGIN;

ALTER TABLE public.gri_snapshots
  ADD COLUMN IF NOT EXISTS disposition_hash text;

ALTER TABLE public.gri_snapshots
  ADD COLUMN IF NOT EXISTS candidate_event_count integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'gri_snapshot_candidate_event_count_check'
  ) THEN
    ALTER TABLE public.gri_snapshots
      ADD CONSTRAINT gri_snapshot_candidate_event_count_check
      CHECK (
        candidate_event_count IS NULL
        OR candidate_event_count >= 0
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'gri_snapshot_disposition_hash_check'
  ) THEN
    ALTER TABLE public.gri_snapshots
      ADD CONSTRAINT gri_snapshot_disposition_hash_check
      CHECK (
        disposition_hash IS NULL
        OR disposition_hash ~ '^[a-f0-9]{64}$'
      );
  END IF;
END $$;

-- ============================================================
-- GRI Phase 4 source disposition audit ledger.
--
-- One immutable row per candidate event in the snapshot's
-- observation window. This explains whether the event affected
-- GRI and, if not, why it did not.
--
-- This does NOT replace gri_contributions and does not alter the
-- GRI v1.1 scoring methodology.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.gri_source_dispositions (
  snapshot_id uuid NOT NULL
    REFERENCES public.gri_snapshots(id)
    ON DELETE CASCADE,

  event_id text NOT NULL,

  disposition_version text NOT NULL,
  disposition text NOT NULL,

  classification_source text,

  category text,

  source_name text,
  source_domain text,
  source_url text,
  source_title text,
  summary text,

  observed_at timestamptz,
  published_at timestamptz,

  classification_provider text,
  classification_model text,
  classification_version text,
  classification_prompt_version text,
  classification_scored_at timestamptz,
  classification_input_hash text,

  story_cluster_id uuid
    REFERENCES public.gri_story_clusters(id)
    ON DELETE RESTRICT,

  raw_weight numeric(14,10),
  source_effective_weight numeric(14,10),
  pre_story_event_weight numeric(14,10),
  story_effective_weight numeric(14,10),
  effective_event_weight numeric(14,10),
  contribution_points numeric(14,8),

  created_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (snapshot_id, event_id),

  CONSTRAINT gri_source_disposition_version_check
    CHECK (
      disposition_version = 'gri-disposition-v1.0.0'
    ),

  CONSTRAINT gri_source_disposition_value_check
    CHECK (
      disposition IN (
        'included',
        'excluded_noncanonical_classification'
      )
    ),

  CONSTRAINT gri_source_disposition_classification_source_check
    CHECK (
      classification_source IS NULL
      OR classification_source IN (
        'direct',
        'reassessment'
      )
    ),

  CONSTRAINT gri_source_disposition_input_hash_check
    CHECK (
      classification_input_hash IS NULL
      OR classification_input_hash ~ '^[a-f0-9]{64}$'
    ),

  CONSTRAINT gri_source_disposition_included_contract_check
    CHECK (
      (
        disposition = 'included'
        AND classification_source IS NOT NULL
        AND story_cluster_id IS NOT NULL
        AND raw_weight IS NOT NULL
        AND source_effective_weight IS NOT NULL
        AND pre_story_event_weight IS NOT NULL
        AND story_effective_weight IS NOT NULL
        AND effective_event_weight IS NOT NULL
        AND contribution_points IS NOT NULL
      )
      OR
      (
        disposition <> 'included'
        AND story_cluster_id IS NULL
        AND raw_weight IS NULL
        AND source_effective_weight IS NULL
        AND pre_story_event_weight IS NULL
        AND story_effective_weight IS NULL
        AND effective_event_weight IS NULL
        AND contribution_points IS NULL
      )
    )
);

CREATE INDEX IF NOT EXISTS gri_source_dispositions_event_idx
  ON public.gri_source_dispositions(event_id);

CREATE INDEX IF NOT EXISTS gri_source_dispositions_snapshot_disposition_idx
  ON public.gri_source_dispositions(snapshot_id, disposition);

ALTER TABLE public.gri_source_dispositions
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS
  "gri_source_dispositions_anon_read"
  ON public.gri_source_dispositions;

CREATE POLICY
  "gri_source_dispositions_anon_read"
ON public.gri_source_dispositions
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.gri_snapshots s
    WHERE s.id = snapshot_id
      AND s.status = 'published'
  )
);

-- ------------------------------------------------------------
-- Published disposition rows are immutable.
-- Draft rows may still be cleaned up if publication fails.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION
public.prevent_published_gri_source_disposition_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status
  INTO v_status
  FROM public.gri_snapshots
  WHERE id = COALESCE(OLD.snapshot_id, NEW.snapshot_id);

  IF v_status = 'published' THEN
    RAISE EXCEPTION
      'Published GRI source dispositions are immutable';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS
  gri_source_disposition_immutable_after_publish
  ON public.gri_source_dispositions;

CREATE TRIGGER
  gri_source_disposition_immutable_after_publish
BEFORE INSERT OR UPDATE OR DELETE
ON public.gri_source_dispositions
FOR EACH ROW
EXECUTE FUNCTION
  public.prevent_published_gri_source_disposition_mutation();

-- ------------------------------------------------------------
-- Publication backstop:
--
-- 1. disposition rows must cover at least every scored event;
-- 2. included disposition count must equal snapshot event_count;
-- 3. included IDs must exactly match contribution IDs;
-- 4. no contribution may exist without an included disposition;
-- 5. no included disposition may exist without a contribution.
--
-- Candidate-count completeness will additionally be verified
-- by the application before publication.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION
public.enforce_gri_source_disposition_on_publish()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_dispositions integer;
  v_included integer;
  v_missing_contribution integer;
  v_missing_disposition integer;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status = 'published'
     AND NEW.methodology_version = 'gri-v1.1.0'
     AND NEW.proof_version = 'gri-proof-v1.2.0'
  THEN

    IF NEW.disposition_hash IS NULL
       OR NEW.disposition_hash !~ '^[a-f0-9]{64}$'
    THEN
      RAISE EXCEPTION
        'GRI proof v1.2 snapshot cannot publish without disposition_hash';
    END IF;

    SELECT
      count(*)::integer,
      count(*) FILTER (
        WHERE disposition = 'included'
      )::integer
    INTO
      v_total_dispositions,
      v_included
    FROM public.gri_source_dispositions
    WHERE snapshot_id = NEW.id;

    IF NEW.candidate_event_count IS NULL THEN
      RAISE EXCEPTION
        'GRI proof v1.2 snapshot cannot publish without candidate_event_count';
    END IF;

    IF NEW.candidate_event_count < NEW.event_count THEN
      RAISE EXCEPTION
        'GRI candidate event count cannot be lower than scored event count';
    END IF;

    IF v_total_dispositions <> NEW.candidate_event_count THEN
      RAISE EXCEPTION
        'GRI source disposition coverage mismatch: snapshot candidates %, ledger dispositions %',
        NEW.candidate_event_count,
        v_total_dispositions;
    END IF;

    IF v_included <> NEW.event_count THEN
      RAISE EXCEPTION
        'GRI included disposition count mismatch: snapshot %, dispositions %',
        NEW.event_count,
        v_included;
    END IF;

    SELECT count(*)::integer
    INTO v_missing_contribution
    FROM public.gri_source_dispositions d
    LEFT JOIN public.gri_contributions c
      ON c.snapshot_id = d.snapshot_id
     AND c.event_id = d.event_id
    WHERE d.snapshot_id = NEW.id
      AND d.disposition = 'included'
      AND c.event_id IS NULL;

    IF v_missing_contribution <> 0 THEN
      RAISE EXCEPTION
        'GRI disposition ledger contains % included row(s) without contribution',
        v_missing_contribution;
    END IF;

    SELECT count(*)::integer
    INTO v_missing_disposition
    FROM public.gri_contributions c
    LEFT JOIN public.gri_source_dispositions d
      ON d.snapshot_id = c.snapshot_id
     AND d.event_id = c.event_id
     AND d.disposition = 'included'
    WHERE c.snapshot_id = NEW.id
      AND d.event_id IS NULL;

    IF v_missing_disposition <> 0 THEN
      RAISE EXCEPTION
        'GRI contribution ledger contains % row(s) without included disposition',
        v_missing_disposition;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS
  trg_gri_source_disposition_publish
  ON public.gri_snapshots;

CREATE TRIGGER
  trg_gri_source_disposition_publish
BEFORE UPDATE OF status
ON public.gri_snapshots
FOR EACH ROW
EXECUTE FUNCTION
  public.enforce_gri_source_disposition_on_publish();


-- Phase 4 proof-envelope transition:
-- comparison continuity belongs to the GRI methodology/story contract,
-- not to one proof-envelope version.
CREATE OR REPLACE FUNCTION public.enforce_gri_v11_comparison_metadata_on_publish()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_expected_previous_id uuid;
  v_expected_previous_as_of timestamptz;
  v_expected_previous_display_score integer;
  v_actual_gap_hours numeric;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status = 'published'
     AND NEW.methodology_version = 'gri-v1.1.0'
  THEN

    IF NEW.comparison_target_as_of IS NULL
       OR NEW.comparison_status IS NULL
    THEN
      RAISE EXCEPTION
        'GRI v1.1 snapshot cannot publish without comparison metadata';
    END IF;

    IF abs(
      extract(
        epoch FROM (
          NEW.comparison_target_as_of
          - (NEW.as_of - interval '24 hours')
        )
      )
    ) > 1
    THEN
      RAISE EXCEPTION
        'GRI v1.1 comparison target must equal snapshot as_of minus 24 hours';
    END IF;

    SELECT
      s.id,
      s.as_of,
      s.display_score
    INTO
      v_expected_previous_id,
      v_expected_previous_as_of,
      v_expected_previous_display_score
    FROM public.gri_snapshots s
    WHERE s.status = 'published'
      AND s.verification_status = 'verified'
      AND s.methodology_version = 'gri-v1.1.0'
      AND s.story_correlation_version = 'story-correlation-v1.0.0'
      AND s.story_correlation_prompt_version = 'story-match-title-v1.0.0'
      AND s.as_of < NEW.as_of
      AND s.id <> NEW.id
    ORDER BY s.as_of DESC
    LIMIT 1;

    IF v_expected_previous_id IS NULL THEN
      IF NEW.previous_publication_snapshot_id IS NOT NULL
         OR NEW.previous_publication_as_of IS NOT NULL
         OR NEW.previous_publication_display_score IS NOT NULL
      THEN
        RAISE EXCEPTION
          'GRI v1.1 previous-publication metadata must be NULL when no prior snapshot exists';
      END IF;
    ELSE
      IF NEW.previous_publication_snapshot_id IS DISTINCT FROM v_expected_previous_id
         OR NEW.previous_publication_as_of IS DISTINCT FROM v_expected_previous_as_of
         OR NEW.previous_publication_display_score IS DISTINCT FROM v_expected_previous_display_score
      THEN
        RAISE EXCEPTION
          'GRI v1.1 previous-publication metadata does not match the immediately preceding verified snapshot';
      END IF;
    END IF;

    IF NEW.comparison_status = 'matched' THEN

      IF NEW.comparison_reason IS NOT NULL THEN
        RAISE EXCEPTION
          'GRI v1.1 matched comparison cannot contain a comparison failure reason';
      END IF;

      IF NEW.previous_snapshot_id IS NULL
         OR NEW.previous_as_of IS NULL
         OR NEW.previous_display_score IS NULL
         OR NEW.comparison_gap_hours IS NULL
      THEN
        RAISE EXCEPTION
          'GRI v1.1 matched comparison requires complete T-24h snapshot metadata';
      END IF;

      v_actual_gap_hours :=
        abs(
          extract(
            epoch FROM (
              NEW.previous_as_of - NEW.comparison_target_as_of
            )
          )
        ) / 3600.0;

      IF v_actual_gap_hours > 6.000001 THEN
        RAISE EXCEPTION
          'GRI v1.1 matched comparison exceeds the T-24h plus/minus 6 hour window';
      END IF;

      IF abs(v_actual_gap_hours - NEW.comparison_gap_hours) > 0.00001 THEN
        RAISE EXCEPTION
          'GRI v1.1 stored comparison gap does not reconcile';
      END IF;

      IF NEW.change_hash IS NULL
         OR NEW.change_attribution IS NULL
         OR NEW.change_residual IS NULL
      THEN
        RAISE EXCEPTION
          'GRI v1.1 matched comparison requires a complete change-attribution proof';
      END IF;

    ELSE

      IF NEW.previous_snapshot_id IS NOT NULL
         OR NEW.previous_as_of IS NOT NULL
         OR NEW.previous_raw_score IS NOT NULL
         OR NEW.previous_display_score IS NOT NULL
         OR NEW.change_points IS NOT NULL
         OR NEW.change_hash IS NOT NULL
         OR NEW.change_attribution IS NOT NULL
         OR NEW.change_residual IS NOT NULL
         OR NEW.comparison_gap_hours IS NOT NULL
      THEN
        RAISE EXCEPTION
          'GRI v1.1 unmatched comparison cannot contain T-24h change-attribution values';
      END IF;

      IF NEW.comparison_reason IS NULL
         OR btrim(NEW.comparison_reason) = ''
      THEN
        RAISE EXCEPTION
          'GRI v1.1 unmatched comparison requires a deterministic reason';
      END IF;

    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
