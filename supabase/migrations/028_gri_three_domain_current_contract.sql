-- =============================================================================
-- Geomacro GRI three-domain current contract
--
-- Active intelligence domains:
--   geopolitics
--   macro
--   rare_earth
--
-- Current contract:
--   methodology: gri-v1.2.0
--   classifier: event-severity-v1.0.5
--   classifier prompt: risk-desk-filter-v1.0.5
--   proof: gri-proof-v1.2.0
--   story correlation: story-correlation-v1.0.0
--   replay: gri-replay-v1.2.0
--
-- Historical v1.1 functions/triggers remain intact.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_gri_three_domain_story_provenance_on_publish()
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
     AND NEW.methodology_version = 'gri-v1.2.0'
  THEN
    IF NEW.story_correlation_version IS DISTINCT FROM 'story-correlation-v1.0.0'
       OR NEW.story_correlation_prompt_version IS DISTINCT FROM 'story-match-title-v1.0.0'
       OR NEW.independent_story_count IS NULL
       OR NEW.independent_story_count <= 0
    THEN
      RAISE EXCEPTION
        'GRI v1.2 snapshot cannot publish without current story-correlation contract metadata';
    END IF;

    SELECT
      count(*)::integer,
      count(DISTINCT story_cluster_id)::integer,
      count(*) FILTER (
        WHERE classification_version IS DISTINCT FROM 'event-severity-v1.0.5'
           OR classification_prompt_version IS DISTINCT FROM 'risk-desk-filter-v1.0.5'
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
        'GRI v1.2 contribution count mismatch: snapshot %, ledger %',
        NEW.event_count,
        v_contribution_count;
    END IF;

    IF v_story_count <> NEW.independent_story_count THEN
      RAISE EXCEPTION
        'GRI v1.2 story count mismatch: snapshot %, ledger %',
        NEW.independent_story_count,
        v_story_count;
    END IF;

    IF v_invalid_count <> 0 THEN
      RAISE EXCEPTION
        'GRI v1.2 contribution ledger contains % invalid story provenance row(s)',
        v_invalid_count;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS
  trg_gri_three_domain_story_provenance_publish
  ON public.gri_snapshots;

CREATE TRIGGER
  trg_gri_three_domain_story_provenance_publish
BEFORE UPDATE OF status ON public.gri_snapshots
FOR EACH ROW
EXECUTE FUNCTION
  public.enforce_gri_three_domain_story_provenance_on_publish();


CREATE OR REPLACE FUNCTION
public.enforce_gri_three_domain_source_disposition_on_publish()
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
     AND NEW.methodology_version = 'gri-v1.2.0'
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
  trg_gri_three_domain_source_disposition_publish
  ON public.gri_snapshots;

CREATE TRIGGER
  trg_gri_three_domain_source_disposition_publish
BEFORE UPDATE OF status ON public.gri_snapshots
FOR EACH ROW
EXECUTE FUNCTION
  public.enforce_gri_three_domain_source_disposition_on_publish();


CREATE OR REPLACE FUNCTION public.enforce_gri_three_domain_comparison_metadata_on_publish()
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
     AND NEW.methodology_version = 'gri-v1.2.0'
  THEN

    IF NEW.comparison_target_as_of IS NULL
       OR NEW.comparison_status IS NULL
    THEN
      RAISE EXCEPTION
        'GRI v1.2 snapshot cannot publish without comparison metadata';
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
        'GRI v1.2 comparison target must equal snapshot as_of minus 24 hours';
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
      AND s.methodology_version = 'gri-v1.2.0'
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
          'GRI v1.2 previous-publication metadata must be NULL when no prior snapshot exists';
      END IF;
    ELSE
      IF NEW.previous_publication_snapshot_id IS DISTINCT FROM v_expected_previous_id
         OR NEW.previous_publication_as_of IS DISTINCT FROM v_expected_previous_as_of
         OR NEW.previous_publication_display_score IS DISTINCT FROM v_expected_previous_display_score
      THEN
        RAISE EXCEPTION
          'GRI v1.2 previous-publication metadata does not match the immediately preceding verified snapshot';
      END IF;
    END IF;

    IF NEW.comparison_status = 'matched' THEN

      IF NEW.comparison_reason IS NOT NULL THEN
        RAISE EXCEPTION
          'GRI v1.2 matched comparison cannot contain a comparison failure reason';
      END IF;

      IF NEW.previous_snapshot_id IS NULL
         OR NEW.previous_as_of IS NULL
         OR NEW.previous_display_score IS NULL
         OR NEW.comparison_gap_hours IS NULL
      THEN
        RAISE EXCEPTION
          'GRI v1.2 matched comparison requires complete T-24h snapshot metadata';
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
          'GRI v1.2 matched comparison exceeds the T-24h plus/minus 6 hour window';
      END IF;

      IF abs(v_actual_gap_hours - NEW.comparison_gap_hours) > 0.00001 THEN
        RAISE EXCEPTION
          'GRI v1.2 stored comparison gap does not reconcile';
      END IF;

      IF NEW.change_hash IS NULL
         OR NEW.change_attribution IS NULL
         OR NEW.change_residual IS NULL
      THEN
        RAISE EXCEPTION
          'GRI v1.2 matched comparison requires a complete change-attribution proof';
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
          'GRI v1.2 unmatched comparison cannot contain T-24h change-attribution values';
      END IF;

      IF NEW.comparison_reason IS NULL
         OR btrim(NEW.comparison_reason) = ''
      THEN
        RAISE EXCEPTION
          'GRI v1.2 unmatched comparison requires a deterministic reason';
      END IF;

    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS
  trg_gri_three_domain_comparison_metadata_publish
  ON public.gri_snapshots;

CREATE TRIGGER
  trg_gri_three_domain_comparison_metadata_publish
BEFORE UPDATE OF status ON public.gri_snapshots
FOR EACH ROW
EXECUTE FUNCTION
  public.enforce_gri_three_domain_comparison_metadata_on_publish();


CREATE OR REPLACE FUNCTION public.enforce_gri_three_domain_replay_on_publish()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_snapshot_count integer;
  v_valid_count integer;
BEGIN
  IF NEW.status = 'published'
     AND OLD.status IS DISTINCT FROM 'published'
     AND NEW.replay_version = 'gri-replay-v1.2.0'
  THEN
    IF NEW.methodology_version IS DISTINCT FROM 'gri-v1.2.0' THEN
      RAISE EXCEPTION
        'gri-replay-v1.2.0 requires methodology gri-v1.2.0';
    END IF;

    IF NEW.proof_version IS DISTINCT FROM 'gri-proof-v1.2.0' THEN
      RAISE EXCEPTION
        'gri-replay-v1.2.0 requires proof gri-proof-v1.2.0';
    END IF;

    IF NEW.story_correlation_version
         IS DISTINCT FROM 'story-correlation-v1.0.0'
       OR NEW.story_correlation_prompt_version
         IS DISTINCT FROM 'story-match-title-v1.0.0'
    THEN
      RAISE EXCEPTION
        'gri-replay-v1.2.0 requires current story-correlation contract';
    END IF;

    SELECT
      count(*)::integer,
      count(*) FILTER (
        WHERE
          proof_verified = true
          AND proof_version = 'gri-proof-v1.2.0'
          AND proof_hash ~ '^[a-f0-9]{64}$'
          AND independent_story_count >= 0
          AND independent_story_count <= event_count
          AND story_correlation_version = 'story-correlation-v1.0.0'
          AND story_correlation_prompt_version = 'story-match-title-v1.0.0'
          AND (
            reconciliation_residual IS NULL
            OR abs(reconciliation_residual) <= 0.000001
          )
      )::integer
    INTO v_snapshot_count, v_valid_count
    FROM public.gri_replay_snapshots
    WHERE replay_run_id = NEW.id;

    IF v_snapshot_count <> NEW.snapshot_count THEN
      RAISE EXCEPTION
        'replay snapshot count mismatch: stored %, expected %',
        v_snapshot_count,
        NEW.snapshot_count;
    END IF;

    IF v_valid_count <> v_snapshot_count THEN
      RAISE EXCEPTION
        'gri-replay-v1.2.0 publication blocked: proof envelope incomplete';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS
  trg_gri_three_domain_replay_publish
  ON public.gri_replay_runs;

CREATE TRIGGER
  trg_gri_three_domain_replay_publish
BEFORE UPDATE OF status ON public.gri_replay_runs
FOR EACH ROW
EXECUTE FUNCTION
  public.enforce_gri_three_domain_replay_on_publish();

COMMIT;
