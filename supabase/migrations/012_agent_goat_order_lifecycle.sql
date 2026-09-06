-- =============================================================================
-- Geomacro GOAT Flow order lifecycle
--
-- Forward-only, additive migration.
-- Persists GOAT order/payment lifecycle metadata for production x402 settlement.
-- Does not modify GRI/events/core intelligence tables.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.agent_goat_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  request_id uuid NOT NULL
    REFERENCES public.agent_api_requests(id)
    ON DELETE CASCADE,

  goat_order_id text NOT NULL,
  dapp_order_id text NOT NULL,

  payer_address text NOT NULL,
  source_chain_id bigint NOT NULL CHECK (source_chain_id > 0),

  token_symbol text NOT NULL,
  token_contract text,

  amount_wei text NOT NULL CHECK (amount_wei ~ '^[0-9]+$'),
  pay_to_address text,

  order_status text NOT NULL CHECK (
    order_status IN (
      'CHECKOUT_VERIFIED',
      'PAYMENT_CONFIRMED',
      'INVOICED',
      'FAILED',
      'EXPIRED',
      'CANCELLED'
    )
  ),

  payment_flow text,
  tx_hash text,

  expires_at timestamptz,
  confirmed_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_goat_orders_goat_order_id_idx
  ON public.agent_goat_orders (goat_order_id);

CREATE UNIQUE INDEX IF NOT EXISTS agent_goat_orders_dapp_order_id_idx
  ON public.agent_goat_orders (dapp_order_id);

CREATE UNIQUE INDEX IF NOT EXISTS agent_goat_orders_request_id_idx
  ON public.agent_goat_orders (request_id);

CREATE UNIQUE INDEX IF NOT EXISTS agent_goat_orders_tx_hash_idx
  ON public.agent_goat_orders (tx_hash)
  WHERE tx_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS agent_goat_orders_status_idx
  ON public.agent_goat_orders (order_status, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_goat_orders_payer_idx
  ON public.agent_goat_orders (payer_address, created_at DESC);

CREATE OR REPLACE FUNCTION public.update_agent_goat_order_updated_at()
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
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'agent_goat_orders_updated_at'
  ) THEN
    CREATE TRIGGER agent_goat_orders_updated_at
      BEFORE UPDATE ON public.agent_goat_orders
      FOR EACH ROW
      EXECUTE FUNCTION public.update_agent_goat_order_updated_at();
  END IF;
END $$;

ALTER TABLE public.agent_goat_orders ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.agent_goat_orders TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_goat_orders'
      AND policyname = 'Service role manages agent GOAT orders'
  ) THEN
    CREATE POLICY "Service role manages agent GOAT orders"
      ON public.agent_goat_orders
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Settlement identity must be unique at the database layer as well.
-- Multiple retries may refer to the same provider settlement, but they may
-- never create multiple payment records for it.
CREATE UNIQUE INDEX IF NOT EXISTS agent_payments_provider_reference_idx
  ON public.agent_payments (provider, provider_reference)
  WHERE provider_reference IS NOT NULL;

-- =============================================================================
-- GOAT external-order creation lease
--
-- GOAT's createOrder API does not document dapp_order_id as a provider-side
-- idempotency guarantee. This durable lease serializes external order creation
-- per agent request without holding a database transaction open across the
-- external GOAT API call.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.agent_goat_order_creation_claims (
  request_id uuid PRIMARY KEY
    REFERENCES public.agent_api_requests(id)
    ON DELETE CASCADE,

  claim_token uuid NOT NULL,
  dapp_order_id text NOT NULL,

  -- Once the external GOAT createOrder call begins, this claim becomes
  -- non-reclaimable automatically. If the provider created an order but the
  -- local persistence step failed, retrying createOrder could create a second
  -- chargeable order. Such requests must fail closed for reconciliation.
  provider_creation_attempted_at timestamptz,

  claimed_at timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (lease_expires_at > claimed_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_goat_order_creation_claims_dapp_order_idx
  ON public.agent_goat_order_creation_claims (dapp_order_id);

ALTER TABLE public.agent_goat_order_creation_claims ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.agent_goat_order_creation_claims TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_goat_order_creation_claims'
      AND policyname = 'Service role manages GOAT order creation claims'
  ) THEN
    CREATE POLICY "Service role manages GOAT order creation claims"
      ON public.agent_goat_order_creation_claims
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.claim_agent_goat_order_creation(
  p_request_id uuid,
  p_dapp_order_id text,
  p_claim_token uuid,
  p_lease_seconds integer DEFAULT 45
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_rows integer := 0;
BEGIN
  IF p_lease_seconds < 5 OR p_lease_seconds > 300 THEN
    RAISE EXCEPTION 'invalid GOAT order creation lease duration';
  END IF;

  INSERT INTO public.agent_goat_order_creation_claims (
    request_id,
    claim_token,
    dapp_order_id,
    claimed_at,
    lease_expires_at
  )
  VALUES (
    p_request_id,
    p_claim_token,
    p_dapp_order_id,
    now(),
    now() + make_interval(secs => p_lease_seconds)
  )
  ON CONFLICT (request_id) DO UPDATE
  SET
    claim_token = EXCLUDED.claim_token,
    dapp_order_id = EXCLUDED.dapp_order_id,
    claimed_at = now(),
    lease_expires_at = now() + make_interval(secs => p_lease_seconds),
    updated_at = now()
  WHERE
    agent_goat_order_creation_claims.lease_expires_at <= now()
    AND agent_goat_order_creation_claims.provider_creation_attempted_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.agent_goat_orders o
      WHERE o.request_id = p_request_id
    );

  GET DIAGNOSTICS affected_rows = ROW_COUNT;

  RETURN affected_rows > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_agent_goat_order_creation_attempted(
  p_request_id uuid,
  p_claim_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_rows integer := 0;
BEGIN
  UPDATE public.agent_goat_order_creation_claims
  SET
    provider_creation_attempted_at = COALESCE(
      provider_creation_attempted_at,
      now()
    ),
    updated_at = now()
  WHERE request_id = p_request_id
    AND claim_token = p_claim_token
    AND lease_expires_at > now();

  GET DIAGNOSTICS affected_rows = ROW_COUNT;

  RETURN affected_rows > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_agent_goat_order_creation(
  p_request_id uuid,
  p_claim_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_rows integer := 0;
BEGIN
  -- Do not delete the claim row. Expire the lease in place so the creation
  -- history remains inspectable and migration safety stays non-destructive.
  UPDATE public.agent_goat_order_creation_claims
  SET
    lease_expires_at = now(),
    updated_at = now()
  WHERE request_id = p_request_id
    AND claim_token = p_claim_token
    AND lease_expires_at > now();

  GET DIAGNOSTICS affected_rows = ROW_COUNT;

  RETURN affected_rows > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_agent_goat_order_creation(uuid, text, uuid, integer)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_agent_goat_order_creation_attempted(uuid, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_agent_goat_order_creation(uuid, uuid)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.claim_agent_goat_order_creation(uuid, text, uuid, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_agent_goat_order_creation_attempted(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.release_agent_goat_order_creation(uuid, uuid)
  TO service_role;
