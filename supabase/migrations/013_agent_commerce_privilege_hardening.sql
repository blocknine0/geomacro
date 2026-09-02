-- =============================================================================
-- Geomacro agent commerce privilege hardening
--
-- Forward-only security migration.
-- Agent commerce tables and privileged GOAT lifecycle RPCs are server-only.
-- Supabase default/public grants must not expose them to anon/authenticated.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Server-only tables
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE public.agent_api_requests
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public.agent_payments
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public.agent_goat_orders
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public.agent_goat_order_creation_claims
  FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.agent_api_requests
  TO service_role;

GRANT ALL ON TABLE public.agent_payments
  TO service_role;

GRANT ALL ON TABLE public.agent_goat_orders
  TO service_role;

GRANT ALL ON TABLE public.agent_goat_order_creation_claims
  TO service_role;

-- ---------------------------------------------------------------------------
-- Privileged GOAT lifecycle RPCs
-- SECURITY DEFINER functions must be callable only by service_role.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.claim_agent_goat_order_creation(
  uuid, text, uuid, integer
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.mark_agent_goat_order_creation_attempted(
  uuid, uuid
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.release_agent_goat_order_creation(
  uuid, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_agent_goat_order_creation(
  uuid, text, uuid, integer
) TO service_role;

GRANT EXECUTE ON FUNCTION public.mark_agent_goat_order_creation_attempted(
  uuid, uuid
) TO service_role;

GRANT EXECUTE ON FUNCTION public.release_agent_goat_order_creation(
  uuid, uuid
) TO service_role;
