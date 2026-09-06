BEGIN;

-- ============================================================
-- GRI replay v1.1 proof envelope
--
-- Retrospective replay remains lookahead_safe=false.
-- These fields make each replay snapshot auditable under the
-- same deterministic proof contract as live gri-v1.1.0.
-- ============================================================

ALTER TABLE public.gri_replay_runs
  ADD COLUMN IF NOT EXISTS proof_version text,
  ADD COLUMN IF NOT EXISTS story_correlation_version text,
  ADD COLUMN IF NOT EXISTS story_correlation_prompt_version text;

ALTER TABLE public.gri_replay_snapshots
  ADD COLUMN IF NOT EXISTS independent_story_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS story_correlation_version text,
  ADD COLUMN IF NOT EXISTS story_correlation_prompt_version text,
  ADD COLUMN IF NOT EXISTS proof_version text,
  ADD COLUMN IF NOT EXISTS proof_hash text,
  ADD COLUMN IF NOT EXISTS reconciliation_residual numeric(18,12),
  ADD COLUMN IF NOT EXISTS proof_verified boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'gri_replay_story_count_check'
  ) THEN
    ALTER TABLE public.gri_replay_snapshots
      ADD CONSTRAINT gri_replay_story_count_check
      CHECK (
        independent_story_count >= 0
        AND independent_story_count <= event_count
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'gri_replay_proof_hash_check'
  ) THEN
    ALTER TABLE public.gri_replay_snapshots
      ADD CONSTRAINT gri_replay_proof_hash_check
      CHECK (
        proof_hash IS NULL
        OR proof_hash ~ '^[a-f0-9]{64}$'
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'gri_replay_reconciliation_check'
  ) THEN
    ALTER TABLE public.gri_replay_snapshots
      ADD CONSTRAINT gri_replay_reconciliation_check
      CHECK (
        reconciliation_residual IS NULL
        OR abs(reconciliation_residual) <= 0.000001
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_gri_replay_v11_on_publish()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_snapshot_count integer;
  v_valid_count integer;
BEGIN
  IF NEW.status = 'published'
     AND OLD.status IS DISTINCT FROM 'published'
     AND NEW.replay_version = 'gri-replay-v1.1.0'
  THEN
    IF NEW.methodology_version IS DISTINCT FROM 'gri-v1.1.0' THEN
      RAISE EXCEPTION
        'gri-replay-v1.1.0 requires methodology gri-v1.1.0';
    END IF;

    IF NEW.proof_version IS DISTINCT FROM 'gri-proof-v1.1.0' THEN
      RAISE EXCEPTION
        'gri-replay-v1.1.0 requires proof gri-proof-v1.1.0';
    END IF;

    IF NEW.story_correlation_version
         IS DISTINCT FROM 'story-correlation-v1.0.0'
       OR NEW.story_correlation_prompt_version
         IS DISTINCT FROM 'story-match-title-v1.0.0'
    THEN
      RAISE EXCEPTION
        'gri-replay-v1.1.0 requires current story-correlation contract';
    END IF;

    SELECT
      count(*)::integer,
      count(*) FILTER (
        WHERE
          proof_verified = true
          AND proof_version = 'gri-proof-v1.1.0'
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
        'gri-replay-v1.1.0 publication blocked: proof envelope incomplete';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gri_replay_v11_publish_guard
ON public.gri_replay_runs;

CREATE TRIGGER gri_replay_v11_publish_guard
BEFORE UPDATE OF status
ON public.gri_replay_runs
FOR EACH ROW
EXECUTE FUNCTION public.enforce_gri_replay_v11_on_publish();

COMMIT;
