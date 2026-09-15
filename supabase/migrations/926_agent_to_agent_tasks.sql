-- =============================================================================
-- Geomacro A2A v1 durable task, identity, replay-protection and audit state.
-- Additive only. Server/service-role managed. No anonymous table access.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.a2a_agent_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL,
  key_id text NOT NULL,
  public_key_spki_b64 text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','revoked')),
  allowed_capabilities text[] NOT NULL DEFAULT ARRAY['risk_preflight']::text[],
  allowed_payment_modes text[] NOT NULL DEFAULT ARRAY['commercial_credit','x402_testnet']::text[],
  callback_hosts text[] NOT NULL DEFAULT ARRAY[]::text[],
  remote_base_url text,
  commercial_principal_id uuid REFERENCES public.commercial_principals(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, key_id)
);

CREATE INDEX IF NOT EXISTS a2a_agent_registrations_agent_status_idx
  ON public.a2a_agent_registrations (agent_id, status);

CREATE TABLE IF NOT EXISTS public.a2a_request_nonces (
  agent_id text NOT NULL,
  key_id text NOT NULL,
  nonce text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, key_id, nonce)
);

CREATE INDEX IF NOT EXISTS a2a_request_nonces_expiry_idx
  ON public.a2a_request_nonces (expires_at);

CREATE TABLE IF NOT EXISTS public.a2a_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction text NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound','outbound')),
  caller_agent_id text NOT NULL,
  remote_agent_id text,
  external_task_id text NOT NULL,
  capability text NOT NULL CHECK (capability IN ('risk_preflight')),
  payment_mode text NOT NULL CHECK (payment_mode IN ('commercial_credit','x402_testnet')),
  request_payload jsonb NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN (
    'accepted','payment_required','processing','completed','failed','cancelled'
  )),
  commercial_principal_id uuid REFERENCES public.commercial_principals(id) ON DELETE SET NULL,
  settlement_reference text,
  result_payload jsonb,
  result_hash text CHECK (result_hash IS NULL OR result_hash ~ '^[a-f0-9]{64}$'),
  result_signature jsonb,
  callback_url text,
  callback_status text CHECK (callback_status IS NULL OR callback_status IN ('pending','delivered','failed','not_requested')),
  callback_attempts integer NOT NULL DEFAULT 0 CHECK (callback_attempts >= 0 AND callback_attempts <= 10),
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (direction, caller_agent_id, external_task_id)
);

CREATE INDEX IF NOT EXISTS a2a_tasks_status_idx
  ON public.a2a_tasks (status, created_at DESC);
CREATE INDEX IF NOT EXISTS a2a_tasks_remote_idx
  ON public.a2a_tasks (remote_agent_id, created_at DESC)
  WHERE remote_agent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.a2a_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES public.a2a_tasks(id) ON DELETE SET NULL,
  agent_id text NOT NULL,
  event_type text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_hash text NOT NULL CHECK (event_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS a2a_audit_events_task_idx
  ON public.a2a_audit_events (task_id, created_at ASC);
CREATE INDEX IF NOT EXISTS a2a_audit_events_agent_idx
  ON public.a2a_audit_events (agent_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.update_a2a_updated_at()
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
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'a2a_agent_registrations_updated_at') THEN
    CREATE TRIGGER a2a_agent_registrations_updated_at
      BEFORE UPDATE ON public.a2a_agent_registrations
      FOR EACH ROW EXECUTE FUNCTION public.update_a2a_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'a2a_tasks_updated_at') THEN
    CREATE TRIGGER a2a_tasks_updated_at
      BEFORE UPDATE ON public.a2a_tasks
      FOR EACH ROW EXECUTE FUNCTION public.update_a2a_updated_at();
  END IF;
END $$;

ALTER TABLE public.a2a_agent_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.a2a_request_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.a2a_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.a2a_audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.a2a_agent_registrations FROM anon, authenticated;
REVOKE ALL ON public.a2a_request_nonces FROM anon, authenticated;
REVOKE ALL ON public.a2a_tasks FROM anon, authenticated;
REVOKE ALL ON public.a2a_audit_events FROM anon, authenticated;

GRANT ALL ON public.a2a_agent_registrations TO service_role;
GRANT ALL ON public.a2a_request_nonces TO service_role;
GRANT ALL ON public.a2a_tasks TO service_role;
GRANT ALL ON public.a2a_audit_events TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='a2a_agent_registrations' AND policyname='Service role manages A2A registrations') THEN
    CREATE POLICY "Service role manages A2A registrations" ON public.a2a_agent_registrations FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='a2a_request_nonces' AND policyname='Service role manages A2A nonces') THEN
    CREATE POLICY "Service role manages A2A nonces" ON public.a2a_request_nonces FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='a2a_tasks' AND policyname='Service role manages A2A tasks') THEN
    CREATE POLICY "Service role manages A2A tasks" ON public.a2a_tasks FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='a2a_audit_events' AND policyname='Service role appends A2A audit') THEN
    CREATE POLICY "Service role appends A2A audit" ON public.a2a_audit_events FOR INSERT TO service_role WITH CHECK (true);
    CREATE POLICY "Service role reads A2A audit" ON public.a2a_audit_events FOR SELECT TO service_role USING (true);
  END IF;
END $$;
