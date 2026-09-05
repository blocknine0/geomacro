-- =============================================================================
-- Fix Risk Gate rate-limit RPC column ambiguity
--
-- Forward-only replacement of consume_risk_gate_rate_limit().
-- Migration 020 remains immutable in history.
-- =============================================================================

create or replace function
  public.consume_risk_gate_rate_limit(
    p_client_id text,
    p_limit integer
  )
returns table (
  allowed boolean,
  request_count integer,
  limit_count integer,
  window_started_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_count integer;
begin
  if p_limit < 1 or p_limit > 10000 then
    raise exception
      'invalid Risk Gate rate limit';
  end if;

  v_window :=
    date_trunc(
      'minute',
      now()
    );

  insert into public.risk_gate_rate_limits as rl (
    client_id,
    window_started_at,
    request_count,
    updated_at
  )
  values (
    p_client_id,
    v_window,
    1,
    now()
  )
  on conflict (
    client_id,
    window_started_at
  )
  do update
  set
    request_count =
      rl.request_count + 1,

    updated_at =
      now()

  returning
    rl.request_count
  into
    v_count;

  return query
  select
    v_count <= p_limit,
    v_count,
    p_limit,
    v_window;
end;
$$;


revoke all
on function public.consume_risk_gate_rate_limit(
  text,
  integer
)
from PUBLIC, anon, authenticated;


grant execute
on function public.consume_risk_gate_rate_limit(
  text,
  integer
)
to service_role;
