-- =============================================================================
-- Geomacro A2A v1 task network
--
-- Forward-only, additive migration for official Agent2Agent HTTP+JSON task
-- lifecycle, push-notification configuration and audit evidence.
-- No GRI, market or core intelligence table is modified.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.a2a_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_id uuid NOT NULL
    REFERENCES public.commercial_principals(id)
    ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  context_id text NOT NULL CHECK (length(context_id) BETWEEN 1 AND 160),
  skill_id text NOT NULL CHECK (length(skill_id) BETWEEN 1 AND 120),
  state text NOT NULL CHECK (
    state IN (
      'TASK_STATE_SUBMITTED',
      'TASK_STATE_WORKING',
      'TASK_STATE_INPUT_REQUIRED',
      'TASK_STATE_AUTH_REQUIRED',
      'TASK_STATE_COMPLETED',
      'TASK_STATE_CANCELED',
      'TASK_STATE_FAILED',
      'TASK_STATE_REJECTED'
    )
  ),
  remote_agent_id text,
  remote_agent_url text,
  remote_task_id text,
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  response_sha256 text CHECK (response_sha256 IS NULL OR response_sha256 ~ '^[0-9a-f]{64}$'),
  input_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_json jsonb,
  error_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  canceled_at timestamptz
);

CREATE INDEX IF NOT EXISTS a2a_tasks_principal_created_idx
  ON public.a2a_tasks (principal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS a2a_tasks_state_created_idx
  ON public.a2a_tasks (state, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS a2a_tasks_outbound_remote_identity_idx
  ON public.a2a_tasks (principal_id, remote_agent_id, remote_task_id)
  WHERE direction = 'outbound'
    AND remote_agent_id IS NOT NULL
    AND remote_task_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.a2a_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL
    REFERENCES public.a2a_tasks(id)
    ON DELETE CASCADE,
  principal_id uuid NOT NULL
    REFERENCES public.commercial_principals(id)
    ON DELETE CASCADE,
  message_id text NOT NULL CHECK (length(message_id) BETWEEN 1 AND 160),
  role text NOT NULL CHECK (role IN ('ROLE_USER', 'ROLE_AGENT')),
  payload jsonb NOT NULL,
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS a2a_messages_principal_message_id_idx
  ON public.a2a_messages (principal_id, message_id);
CREATE INDEX IF NOT EXISTS a2a_messages_task_created_idx
  ON public.a2a_messages (task_id, created_at ASC);

CREATE TABLE IF NOT EXISTS public.a2a_push_notification_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL
    REFERENCES public.a2a_tasks(id)
    ON DELETE CASCADE,
  principal_id uuid NOT NULL
    REFERENCES public.commercial_principals(id)
    ON DELETE CASCADE,
  callback_url text NOT NULL,
  callback_token text,
  enabled boolean NOT NULL DEFAULT true,
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  last_delivery_status integer,
  last_delivery_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS a2a_push_notification_configs_task_idx
  ON public.a2a_push_notification_configs (task_id, created_at ASC);

COMMENT ON COLUMN public.a2a_push_notification_configs.callback_token IS
  'Opaque task-scoped A2A push validation token. This table never stores remote Authorization credentials and is service-role only.';

CREATE TABLE IF NOT EXISTS public.a2a_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES public.a2a_tasks(id) ON DELETE SET NULL,
  principal_id uuid REFERENCES public.commercial_principals(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound', 'callback')),
  event_type text NOT NULL CHECK (length(event_type) BETWEEN 1 AND 120),
  request_sha256 text CHECK (request_sha256 IS NULL OR request_sha256 ~ '^[0-9a-f]{64}$'),
  response_sha256 text CHECK (response_sha256 IS NULL OR response_sha256 ~ '^[0-9a-f]{64}$'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS a2a_audit_events_task_created_idx
  ON public.a2a_audit_events (task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS a2a_audit_events_principal_created_idx
  ON public.a2a_audit_events (principal_id, created_at DESC);

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
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'a2a_tasks_updated_at') THEN
    CREATE TRIGGER a2a_tasks_updated_at
      BEFORE UPDATE ON public.a2a_tasks
      FOR EACH ROW EXECUTE FUNCTION public.update_a2a_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'a2a_push_notification_configs_updated_at') THEN
    CREATE TRIGGER a2a_push_notification_configs_updated_at
      BEFORE UPDATE ON public.a2a_push_notification_configs
      FOR EACH ROW EXECUTE FUNCTION public.update_a2a_updated_at();
  END IF;
END $$;

ALTER TABLE public.a2a_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.a2a_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.a2a_push_notification_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.a2a_audit_events ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.a2a_tasks TO service_role;
GRANT ALL ON public.a2a_messages TO service_role;
GRANT ALL ON public.a2a_push_notification_configs TO service_role;
GRANT ALL ON public.a2a_audit_events TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'a2a_tasks'
      AND policyname = 'Service role manages A2A tasks'
  ) THEN
    CREATE POLICY "Service role manages A2A tasks"
      ON public.a2a_tasks FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'a2a_messages'
      AND policyname = 'Service role manages A2A messages'
  ) THEN
    CREATE POLICY "Service role manages A2A messages"
      ON public.a2a_messages FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'a2a_push_notification_configs'
      AND policyname = 'Service role manages A2A push configs'
  ) THEN
    CREATE POLICY "Service role manages A2A push configs"
      ON public.a2a_push_notification_configs FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'a2a_audit_events'
      AND policyname = 'Service role manages A2A audit events'
  ) THEN
    CREATE POLICY "Service role manages A2A audit events"
      ON public.a2a_audit_events FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;
