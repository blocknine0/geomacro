BEGIN;

-- ============================================================
-- GRI v1.1 comparison continuity metadata.
--
-- Keep two concepts explicitly separate:
--
-- 1. previous_publication_*
--    Immediately preceding verified snapshot under the same
--    current public contract.
--
-- 2. previous_* / change_*
--    Existing T-24h comparison snapshot used for change attribution.
--
-- Existing immutable snapshots remain untouched. New columns are
-- nullable so historical rows remain valid.
-- ============================================================

ALTER TABLE public.gri_snapshots
  ADD COLUMN IF NOT EXISTS previous_publication_snapshot_id uuid
    REFERENCES public.gri_snapshots(id)
    ON DELETE RESTRICT;

ALTER TABLE public.gri_snapshots
  ADD COLUMN IF NOT EXISTS previous_publication_as_of timestamptz;

ALTER TABLE public.gri_snapshots
  ADD COLUMN IF NOT EXISTS previous_publication_display_score integer;

ALTER TABLE public.gri_snapshots
  ADD COLUMN IF NOT EXISTS comparison_target_as_of timestamptz;

ALTER TABLE public.gri_snapshots
  ADD COLUMN IF NOT EXISTS comparison_status text;

ALTER TABLE public.gri_snapshots
  ADD COLUMN IF NOT EXISTS comparison_gap_hours numeric(12,6);

ALTER TABLE public.gri_snapshots
  ADD COLUMN IF NOT EXISTS comparison_reason text;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'gri_snapshot_comparison_status_check'
  ) THEN
    ALTER TABLE public.gri_snapshots
      ADD CONSTRAINT gri_snapshot_comparison_status_check
      CHECK (
        comparison_status IS NULL
        OR comparison_status IN (
          'matched',
          'no_candidate',
          'no_eligible_candidate'
        )
      );
  END IF;
END $$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'gri_snapshot_comparison_gap_check'
  ) THEN
    ALTER TABLE public.gri_snapshots
      ADD CONSTRAINT gri_snapshot_comparison_gap_check
      CHECK (
        comparison_gap_hours IS NULL
        OR comparison_gap_hours >= 0
      );
  END IF;
END $$;


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

    -- Every new v1.1 publication must explicitly state the T-24h target
    -- and whether a valid comparator was found.
    IF NEW.comparison_target_as_of IS NULL
       OR NEW.comparison_status IS NULL
    THEN
      RAISE EXCEPTION
        'GRI v1.1 snapshot cannot publish without comparison metadata';
    END IF;

    -- Comparison target must be exactly T-24h, allowing one second for
    -- timestamp serialization differences.
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


    -- Determine the immediately preceding verified snapshot under the
    -- exact same current public contract.
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
      AND s.proof_version = 'gri-proof-v1.1.0'
      AND s.story_correlation_version = 'story-correlation-v1.0.0'
      AND s.story_correlation_prompt_version = 'story-match-title-v1.0.0'
      AND s.as_of < NEW.as_of
      AND s.id <> NEW.id
    ORDER BY s.as_of DESC
    LIMIT 1;


    -- previous_publication_* must either be the exact immediately
    -- preceding current-contract snapshot, or all NULL if none exists.
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

      -- No comparator means no fake change attribution may be published.
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


DROP TRIGGER IF EXISTS trg_gri_v11_comparison_metadata_publish
  ON public.gri_snapshots;

CREATE TRIGGER trg_gri_v11_comparison_metadata_publish
BEFORE UPDATE OF status ON public.gri_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.enforce_gri_v11_comparison_metadata_on_publish();

COMMIT;
