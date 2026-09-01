BEGIN;

-- ============================================================
-- GRI methodology v1.1.0 story-aware audit fields.
--
-- Existing gri-v1.0.0 snapshots/contributions remain untouched.
-- New columns are nullable where required for immutable legacy rows.
-- ============================================================

ALTER TABLE public.gri_snapshots
  ADD COLUMN IF NOT EXISTS independent_story_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.gri_snapshots
  ADD COLUMN IF NOT EXISTS story_correlation_version text;

ALTER TABLE public.gri_snapshots
  ADD COLUMN IF NOT EXISTS story_correlation_prompt_version text;


ALTER TABLE public.gri_contributions
  ADD COLUMN IF NOT EXISTS story_cluster_id uuid
    REFERENCES public.gri_story_clusters(id)
    ON DELETE RESTRICT;

ALTER TABLE public.gri_contributions
  ADD COLUMN IF NOT EXISTS story_canonical_label text;

ALTER TABLE public.gri_contributions
  ADD COLUMN IF NOT EXISTS story_assignment_decision text;

ALTER TABLE public.gri_contributions
  ADD COLUMN IF NOT EXISTS story_match_confidence numeric(10,6);

ALTER TABLE public.gri_contributions
  ADD COLUMN IF NOT EXISTS story_decision_rationale text;

ALTER TABLE public.gri_contributions
  ADD COLUMN IF NOT EXISTS story_clustering_provider text;

ALTER TABLE public.gri_contributions
  ADD COLUMN IF NOT EXISTS story_clustering_model text;

ALTER TABLE public.gri_contributions
  ADD COLUMN IF NOT EXISTS story_clustering_version text;

ALTER TABLE public.gri_contributions
  ADD COLUMN IF NOT EXISTS story_clustering_prompt_version text;

ALTER TABLE public.gri_contributions
  ADD COLUMN IF NOT EXISTS story_clustering_scored_at timestamptz;

ALTER TABLE public.gri_contributions
  ADD COLUMN IF NOT EXISTS story_clustering_input_hash text;


-- Weight chain:
-- raw_weight
--   -> source cap
--   -> pre_story_event_weight
--   -> story cap
--   -> effective_event_weight

ALTER TABLE public.gri_contributions
  ADD COLUMN IF NOT EXISTS pre_story_event_weight numeric(14,10);

ALTER TABLE public.gri_contributions
  ADD COLUMN IF NOT EXISTS story_raw_weight numeric(14,10);

ALTER TABLE public.gri_contributions
  ADD COLUMN IF NOT EXISTS story_strongest_source_weight numeric(14,10);

ALTER TABLE public.gri_contributions
  ADD COLUMN IF NOT EXISTS story_effective_weight numeric(14,10);

ALTER TABLE public.gri_contributions
  ADD COLUMN IF NOT EXISTS within_story_share numeric(14,10);


CREATE INDEX IF NOT EXISTS gri_contributions_story_idx
  ON public.gri_contributions(snapshot_id, story_cluster_id);


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'gri_snapshot_independent_story_count_check'
  ) THEN
    ALTER TABLE public.gri_snapshots
      ADD CONSTRAINT gri_snapshot_independent_story_count_check
      CHECK (independent_story_count >= 0);
  END IF;
END $$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'gri_contribution_story_match_confidence_check'
  ) THEN
    ALTER TABLE public.gri_contributions
      ADD CONSTRAINT gri_contribution_story_match_confidence_check
      CHECK (
        story_match_confidence IS NULL
        OR (
          story_match_confidence >= 0
          AND story_match_confidence <= 100
        )
      );
  END IF;
END $$;


-- Database-level publication backstop for methodology v1.1.0.
-- A v1.1 snapshot cannot become public unless the immutable contribution
-- ledger contains complete current-contract story provenance and its stored
-- independent-story count reconciles exactly.

CREATE OR REPLACE FUNCTION public.enforce_gri_v11_story_provenance_on_publish()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_contribution_count integer;
  v_story_count integer;
  v_invalid_count integer;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status = 'published'
     AND NEW.methodology_version = 'gri-v1.1.0'
  THEN
    IF NEW.story_correlation_version IS DISTINCT FROM 'story-correlation-v1.0.0'
       OR NEW.story_correlation_prompt_version IS DISTINCT FROM 'story-match-title-v1.0.0'
       OR NEW.independent_story_count IS NULL
       OR NEW.independent_story_count <= 0
    THEN
      RAISE EXCEPTION
        'GRI v1.1 snapshot cannot publish without current story-correlation contract metadata';
    END IF;

    SELECT
      count(*)::integer,
      count(DISTINCT story_cluster_id)::integer,
      count(*) FILTER (
        WHERE classification_version IS DISTINCT FROM 'event-severity-v1.0.4'
           OR classification_prompt_version IS DISTINCT FROM 'risk-desk-filter-v1.0.4'
           OR classification_provider IS NULL
           OR btrim(classification_provider) = ''
           OR classification_model IS NULL
           OR btrim(classification_model) = ''
           OR classification_scored_at IS NULL
           OR classification_input_hash IS NULL
           OR classification_input_hash !~ '^[a-f0-9]{64}$'
           OR story_cluster_id IS NULL
           OR story_canonical_label IS NULL
           OR btrim(story_canonical_label) = ''
           OR story_assignment_decision NOT IN ('anchor', 'matched')
           OR story_decision_rationale IS NULL
           OR btrim(story_decision_rationale) = ''
           OR story_clustering_provider IS NULL
           OR btrim(story_clustering_provider) = ''
           OR story_clustering_model IS NULL
           OR btrim(story_clustering_model) = ''
           OR story_clustering_version IS DISTINCT FROM 'story-correlation-v1.0.0'
           OR story_clustering_prompt_version IS DISTINCT FROM 'story-match-title-v1.0.0'
           OR story_clustering_scored_at IS NULL
           OR story_clustering_input_hash IS NULL
           OR story_clustering_input_hash !~ '^[a-f0-9]{64}$'
           OR pre_story_event_weight IS NULL
           OR story_raw_weight IS NULL
           OR story_strongest_source_weight IS NULL
           OR story_effective_weight IS NULL
           OR within_story_share IS NULL
      )::integer
    INTO
      v_contribution_count,
      v_story_count,
      v_invalid_count
    FROM public.gri_contributions
    WHERE snapshot_id = NEW.id;

    IF v_contribution_count <> NEW.event_count THEN
      RAISE EXCEPTION
        'GRI v1.1 contribution count mismatch: snapshot %, ledger %',
        NEW.event_count,
        v_contribution_count;
    END IF;

    IF v_story_count <> NEW.independent_story_count THEN
      RAISE EXCEPTION
        'GRI v1.1 story count mismatch: snapshot %, ledger %',
        NEW.independent_story_count,
        v_story_count;
    END IF;

    IF v_invalid_count <> 0 THEN
      RAISE EXCEPTION
        'GRI v1.1 contribution ledger contains % invalid story provenance row(s)',
        v_invalid_count;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gri_v11_story_provenance_publish
  ON public.gri_snapshots;

CREATE TRIGGER trg_gri_v11_story_provenance_publish
BEFORE UPDATE OF status ON public.gri_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.enforce_gri_v11_story_provenance_on_publish();

COMMIT;
