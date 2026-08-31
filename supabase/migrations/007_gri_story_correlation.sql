BEGIN;

-- ============================================================
-- Immutable GRI story-correlation ledger
--
-- A "story" represents one underlying real-world development.
-- Multiple publishers may report the same story.
--
-- This migration does NOT change gri-v1.0.0 scoring.
-- It only creates the immutable provenance layer required for
-- the future story-capped gri-v1.1.0 methodology.
-- ============================================================

CREATE TABLE public.gri_story_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  category text NOT NULL
    CHECK (category IN ('geopolitics', 'macro', 'rare_earth', 'crypto')),

  anchor_event_id uuid NOT NULL
    REFERENCES public.events(id)
    ON DELETE RESTRICT,

  canonical_label text NOT NULL,

  clustering_provider text NOT NULL,
  clustering_model text NOT NULL,
  clustering_version text NOT NULL,
  clustering_prompt_version text NOT NULL,
  clustering_scored_at timestamptz NOT NULL,
  clustering_input_hash text NOT NULL
    CHECK (clustering_input_hash ~ '^[0-9a-f]{64}$'),

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT gri_story_clusters_anchor_contract_key
    UNIQUE (
      anchor_event_id,
      clustering_version,
      clustering_prompt_version
    )
);


CREATE TABLE public.gri_story_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  cluster_id uuid NOT NULL
    REFERENCES public.gri_story_clusters(id)
    ON DELETE RESTRICT,

  event_id uuid NOT NULL
    REFERENCES public.events(id)
    ON DELETE RESTRICT,

  category text NOT NULL
    CHECK (category IN ('geopolitics', 'macro', 'rare_earth', 'crypto')),

  decision text NOT NULL
    CHECK (decision IN ('anchor', 'matched')),

  match_confidence numeric NOT NULL
    CHECK (match_confidence >= 0 AND match_confidence <= 100),

  decision_rationale text NOT NULL,

  clustering_provider text NOT NULL,
  clustering_model text NOT NULL,
  clustering_version text NOT NULL,
  clustering_prompt_version text NOT NULL,
  clustering_scored_at timestamptz NOT NULL,
  clustering_input_hash text NOT NULL
    CHECK (clustering_input_hash ~ '^[0-9a-f]{64}$'),

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT gri_story_assignments_event_contract_key
    UNIQUE (
      event_id,
      clustering_version,
      clustering_prompt_version
    )
);


CREATE INDEX idx_gri_story_clusters_category
  ON public.gri_story_clusters(category);

CREATE INDEX idx_gri_story_clusters_created_at
  ON public.gri_story_clusters(created_at DESC);

CREATE INDEX idx_gri_story_assignments_cluster
  ON public.gri_story_assignments(cluster_id);

CREATE INDEX idx_gri_story_assignments_event
  ON public.gri_story_assignments(event_id);

CREATE INDEX idx_gri_story_assignments_contract
  ON public.gri_story_assignments(
    clustering_version,
    clustering_prompt_version
  );


ALTER TABLE public.gri_story_clusters
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.gri_story_assignments
  ENABLE ROW LEVEL SECURITY;


-- No anonymous/authenticated write policies.
-- Writes are service-role controlled.


CREATE OR REPLACE FUNCTION public.prevent_gri_story_cluster_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'gri_story_clusters is immutable: UPDATE/DELETE is not permitted';
END;
$$;


CREATE OR REPLACE FUNCTION public.prevent_gri_story_assignment_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'gri_story_assignments is immutable: UPDATE/DELETE is not permitted';
END;
$$;


CREATE TRIGGER trg_gri_story_clusters_immutable
BEFORE UPDATE OR DELETE
ON public.gri_story_clusters
FOR EACH ROW
EXECUTE FUNCTION public.prevent_gri_story_cluster_mutation();


CREATE TRIGGER trg_gri_story_assignments_immutable
BEFORE UPDATE OR DELETE
ON public.gri_story_assignments
FOR EACH ROW
EXECUTE FUNCTION public.prevent_gri_story_assignment_mutation();


-- ============================================================
-- Atomic cluster creation
--
-- Creating a story cluster and its initial assignment set must
-- succeed or fail as one PostgreSQL transaction. This prevents
-- immutable orphan/partial clusters if a client fails midway.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_gri_story_cluster_with_assignments(
  p_category text,
  p_anchor_event_id uuid,
  p_canonical_label text,
  p_clustering_provider text,
  p_clustering_model text,
  p_clustering_version text,
  p_clustering_prompt_version text,
  p_clustering_scored_at timestamptz,
  p_clustering_input_hash text,
  p_assignments jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cluster_id uuid;
  v_item jsonb;
  v_event_id uuid;
  v_decision text;
  v_match_confidence numeric;
  v_decision_rationale text;
  v_assignment_count integer;
  v_unique_event_count integer;
  v_anchor_count integer;
BEGIN
  IF p_category NOT IN ('geopolitics', 'macro', 'rare_earth', 'crypto') THEN
    RAISE EXCEPTION 'invalid GRI story category: %', p_category;
  END IF;

  IF p_canonical_label IS NULL OR btrim(p_canonical_label) = '' THEN
    RAISE EXCEPTION 'canonical story label is required';
  END IF;

  IF p_clustering_input_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid clustering input hash';
  END IF;

  IF p_assignments IS NULL OR jsonb_typeof(p_assignments) <> 'array' THEN
    RAISE EXCEPTION 'assignments must be a JSON array';
  END IF;

  v_assignment_count := jsonb_array_length(p_assignments);

  IF v_assignment_count < 1 THEN
    RAISE EXCEPTION 'at least one story assignment is required';
  END IF;

  SELECT count(DISTINCT item->>'event_id')
  INTO v_unique_event_count
  FROM jsonb_array_elements(p_assignments) AS item;

  IF v_unique_event_count <> v_assignment_count THEN
    RAISE EXCEPTION 'duplicate event_id in story assignment batch';
  END IF;

  SELECT count(*)
  INTO v_anchor_count
  FROM jsonb_array_elements(p_assignments) AS item
  WHERE item->>'decision' = 'anchor';

  IF v_anchor_count <> 1 THEN
    RAISE EXCEPTION
      'story cluster must contain exactly one anchor assignment';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_assignments) AS item
    WHERE item->>'decision' = 'anchor'
      AND (item->>'event_id')::uuid = p_anchor_event_id
  ) THEN
    RAISE EXCEPTION
      'story anchor assignment must match anchor_event_id';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_assignments) AS item
    WHERE item->>'decision' NOT IN ('anchor', 'matched')
  ) THEN
    RAISE EXCEPTION 'invalid story assignment decision';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_assignments) AS item
    WHERE COALESCE((item->>'match_confidence')::numeric, -1) < 0
       OR COALESCE((item->>'match_confidence')::numeric, 101) > 100
  ) THEN
    RAISE EXCEPTION 'story match confidence must be between 0 and 100';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_assignments) AS item
    WHERE btrim(COALESCE(item->>'decision_rationale', '')) = ''
  ) THEN
    RAISE EXCEPTION 'story assignment rationale is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_assignments) AS item
    LEFT JOIN public.events e
      ON e.id = (item->>'event_id')::uuid
    WHERE e.id IS NULL
  ) THEN
    RAISE EXCEPTION 'story assignment references an unknown event';
  END IF;

  INSERT INTO public.gri_story_clusters (
    category,
    anchor_event_id,
    canonical_label,
    clustering_provider,
    clustering_model,
    clustering_version,
    clustering_prompt_version,
    clustering_scored_at,
    clustering_input_hash
  )
  VALUES (
    p_category,
    p_anchor_event_id,
    btrim(p_canonical_label),
    p_clustering_provider,
    p_clustering_model,
    p_clustering_version,
    p_clustering_prompt_version,
    p_clustering_scored_at,
    p_clustering_input_hash
  )
  RETURNING id INTO v_cluster_id;

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(p_assignments)
  LOOP
    v_event_id := (v_item->>'event_id')::uuid;
    v_decision := v_item->>'decision';
    v_match_confidence := (v_item->>'match_confidence')::numeric;
    v_decision_rationale := btrim(v_item->>'decision_rationale');

    INSERT INTO public.gri_story_assignments (
      cluster_id,
      event_id,
      category,
      decision,
      match_confidence,
      decision_rationale,
      clustering_provider,
      clustering_model,
      clustering_version,
      clustering_prompt_version,
      clustering_scored_at,
      clustering_input_hash
    )
    VALUES (
      v_cluster_id,
      v_event_id,
      p_category,
      v_decision,
      v_match_confidence,
      v_decision_rationale,
      p_clustering_provider,
      p_clustering_model,
      p_clustering_version,
      p_clustering_prompt_version,
      p_clustering_scored_at,
      p_clustering_input_hash
    );
  END LOOP;

  RETURN v_cluster_id;
END;
$$;


REVOKE ALL
ON FUNCTION public.create_gri_story_cluster_with_assignments(
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  text,
  jsonb
)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.create_gri_story_cluster_with_assignments(
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  text,
  jsonb
)
TO service_role;


-- ============================================================
-- Atomic append to an existing immutable story cluster.
-- Validates category ownership before writing the assignment.
-- ============================================================

CREATE OR REPLACE FUNCTION public.assign_gri_event_to_story_cluster(
  p_cluster_id uuid,
  p_event_id uuid,
  p_category text,
  p_match_confidence numeric,
  p_decision_rationale text,
  p_clustering_provider text,
  p_clustering_model text,
  p_clustering_version text,
  p_clustering_prompt_version text,
  p_clustering_scored_at timestamptz,
  p_clustering_input_hash text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cluster_category text;
  v_assignment_id uuid;
BEGIN
  SELECT category
  INTO v_cluster_category
  FROM public.gri_story_clusters
  WHERE id = p_cluster_id;

  IF v_cluster_category IS NULL THEN
    RAISE EXCEPTION 'unknown GRI story cluster: %', p_cluster_id;
  END IF;

  IF v_cluster_category <> p_category THEN
    RAISE EXCEPTION
      'story category mismatch: cluster %, event %',
      v_cluster_category,
      p_category;
  END IF;

  IF p_match_confidence < 0 OR p_match_confidence > 100 THEN
    RAISE EXCEPTION 'story match confidence must be between 0 and 100';
  END IF;

  IF btrim(COALESCE(p_decision_rationale, '')) = '' THEN
    RAISE EXCEPTION 'story assignment rationale is required';
  END IF;

  IF p_clustering_input_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid clustering input hash';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.events WHERE id = p_event_id
  ) THEN
    RAISE EXCEPTION 'story assignment references an unknown event';
  END IF;

  INSERT INTO public.gri_story_assignments (
    cluster_id,
    event_id,
    category,
    decision,
    match_confidence,
    decision_rationale,
    clustering_provider,
    clustering_model,
    clustering_version,
    clustering_prompt_version,
    clustering_scored_at,
    clustering_input_hash
  )
  VALUES (
    p_cluster_id,
    p_event_id,
    p_category,
    'matched',
    p_match_confidence,
    btrim(p_decision_rationale),
    p_clustering_provider,
    p_clustering_model,
    p_clustering_version,
    p_clustering_prompt_version,
    p_clustering_scored_at,
    p_clustering_input_hash
  )
  RETURNING id INTO v_assignment_id;

  RETURN v_assignment_id;
END;
$$;

REVOKE ALL
ON FUNCTION public.assign_gri_event_to_story_cluster(
  uuid,
  uuid,
  text,
  numeric,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  text
)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.assign_gri_event_to_story_cluster(
  uuid,
  uuid,
  text,
  numeric,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  text
)
TO service_role;

COMMIT;
