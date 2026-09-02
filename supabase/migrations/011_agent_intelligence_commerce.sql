-- =============================================================================
-- Geomacro Agent Intelligence commerce telemetry
-- Forward-only, additive migration. Does not modify GRI/events/core tables.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.agent_api_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capability text NOT NULL,
  event_id uuid REFERENCES public.events(id),
  external_agent_id text,
  idempotency_key text,
  status text NOT NULL CHECK (
    status IN ('started', 'payment_required', 'payment_failed', 'delivered', 'delivery_failed', 'not_found')
  ),
  http_status integer,
  response_code text,
  payment_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.agent_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.agent_api_requests(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('x402')),
  status text NOT NULL CHECK (status IN ('settled', 'failed')),
  amount text NOT NULL CHECK (amount ~ '^[0-9]+$'),
  asset text NOT NULL,
  network text NOT NULL,
  rail text NOT NULL,
  provider_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.agent_api_requests'::regclass
      AND conname = 'agent_api_requests_payment_fk'
  ) THEN
    ALTER TABLE public.agent_api_requests
      ADD CONSTRAINT agent_api_requests_payment_fk
      FOREIGN KEY (payment_id) REFERENCES public.agent_payments(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS agent_api_requests_identity_idempotency_idx
  ON public.agent_api_requests (external_agent_id, idempotency_key)
  WHERE external_agent_id IS NOT NULL AND idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS agent_api_requests_created_at_idx
  ON public.agent_api_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS agent_payments_request_id_idx
  ON public.agent_payments (request_id);

CREATE OR REPLACE FUNCTION public.update_agent_telemetry_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'agent_api_requests_updated_at') THEN
    CREATE TRIGGER agent_api_requests_updated_at
      BEFORE UPDATE ON public.agent_api_requests
      FOR EACH ROW EXECUTE FUNCTION public.update_agent_telemetry_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'agent_payments_updated_at') THEN
    CREATE TRIGGER agent_payments_updated_at
      BEFORE UPDATE ON public.agent_payments
      FOR EACH ROW EXECUTE FUNCTION public.update_agent_telemetry_updated_at();
  END IF;
END $$;

ALTER TABLE public.agent_api_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_payments ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.agent_api_requests TO service_role;
GRANT ALL ON public.agent_payments TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agent_api_requests'
      AND policyname = 'Service role manages agent API requests'
  ) THEN
    CREATE POLICY "Service role manages agent API requests"
      ON public.agent_api_requests FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agent_payments'
      AND policyname = 'Service role manages agent payments'
  ) THEN
    CREATE POLICY "Service role manages agent payments"
      ON public.agent_payments FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;
