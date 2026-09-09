-- =============================================================================
-- Geomacro public Agentic Commerce demo feedback
-- Forward-only, additive and privacy-minimized.
-- No IP address, wallet address, raw request body or payment payload is stored.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.agentic_demo_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid,
  demo_mode text NOT NULL CHECK (demo_mode IN ('PUBLIC_SANDBOX', 'X402_PAID', 'OTHER')),
  tester_type text NOT NULL CHECK (
    tester_type IN ('builder', 'agent_project', 'institution', 'researcher', 'other')
  ),
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  would_integrate boolean,
  outcome text NOT NULL CHECK (
    outcome IN ('worked', 'partly_worked', 'blocked', 'exploring')
  ),
  most_valuable text CHECK (char_length(most_valuable) <= 1000),
  friction text CHECK (char_length(friction) <= 2000),
  missing_capability text CHECK (char_length(missing_capability) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agentic_demo_feedback_created_at_idx
  ON public.agentic_demo_feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS agentic_demo_feedback_request_id_idx
  ON public.agentic_demo_feedback (request_id)
  WHERE request_id IS NOT NULL;

ALTER TABLE public.agentic_demo_feedback ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.agentic_demo_feedback
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.agentic_demo_feedback TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agentic_demo_feedback'
      AND policyname = 'Service role manages agentic demo feedback'
  ) THEN
    CREATE POLICY "Service role manages agentic demo feedback"
      ON public.agentic_demo_feedback
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
