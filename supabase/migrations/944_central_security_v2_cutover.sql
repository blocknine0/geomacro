-- =============================================================================
-- Cut the existing application RPC name over to the sharded v2 implementation.
--
-- Keeping the public function signature stable means every current Nitro
-- instance automatically receives the scalable implementation after migration
-- application, without changing browser/API contracts or weakening fail-closed
-- behavior in src/lib/central-security.server.ts.
-- =============================================================================

create or replace function public.consume_central_security_budget(
  p_route_class text,
  p_client_key text,
  p_window_seconds integer,
  p_client_limit integer,
  p_global_limit integer
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.consume_central_security_budget_v2(
    p_route_class,
    p_client_key,
    p_window_seconds,
    p_client_limit,
    p_global_limit
  );
$$;

revoke all on function public.consume_central_security_budget(
  text,
  text,
  integer,
  integer,
  integer
) from PUBLIC, anon, authenticated;

grant execute on function public.consume_central_security_budget(
  text,
  text,
  integer,
  integer,
  integer
) to service_role;

comment on function public.consume_central_security_budget(text, text, integer, integer, integer) is
  'Stable central-security RPC facade. Delegates to the 16-way sharded v2 abuse-control implementation. Service-role only.';
