-- =============================================================================
-- Geomacro central security abuse-control ledger v2
--
-- Scale goal:
-- - preserve fail-closed, server-only anti-abuse enforcement;
-- - remove the single global hot-row/advisory-lock bottleneck from v1;
-- - keep bounded client identity storage without persisting raw IPs, tokens,
--   signatures, cookies, payment proofs or request bodies;
-- - support horizontally scaled API instances and high-cardinality agents.
--
-- Security model:
-- - a 24-bit client slot is derived only from the server-side HMAC client key;
-- - a 4-bit global shard is derived from the same HMAC, giving 16 independent
--   global counters per route class;
-- - each shard receives ceil(global_limit / 16), so aggregate allowance can
--   exceed the configured global limit by at most 15 requests per window;
-- - per-client and per-global-shard updates remain atomic under advisory locks;
-- - browser roles receive no table or RPC access;
-- - there is intentionally no delete/prune RPC in this migration. Bucket keys
--   are bounded and reused across windows, avoiding a destructive maintenance
--   surface in the security-critical schema.
-- =============================================================================

create table if not exists public.central_security_request_buckets_v2 (
  route_class text not null,
  bucket_kind text not null,
  bucket_key text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0,
  blocked_count integer not null default 0,
  updated_at timestamptz not null default now(),

  constraint central_security_request_buckets_v2_pk
    primary key (route_class, bucket_kind, bucket_key),

  constraint central_security_request_buckets_v2_route_class_check
    check (route_class in (
      'public_api',
      'api_write',
      'server_function',
      'risk_gate',
      'commercial',
      'payment',
      'internal'
    )),

  constraint central_security_request_buckets_v2_kind_check
    check (bucket_kind in ('client', 'global_shard')),

  constraint central_security_request_buckets_v2_key_check
    check (
      (bucket_kind = 'client' and bucket_key ~ '^[0-9a-f]{6}$')
      or
      (bucket_kind = 'global_shard' and bucket_key ~ '^[0-9a-f]$')
    ),

  constraint central_security_request_buckets_v2_request_count_check
    check (request_count >= 0),

  constraint central_security_request_buckets_v2_blocked_count_check
    check (blocked_count >= 0)
);

create index if not exists central_security_request_buckets_v2_updated_idx
  on public.central_security_request_buckets_v2 (updated_at desc);

alter table public.central_security_request_buckets_v2
  enable row level security;

revoke all on table public.central_security_request_buckets_v2
  from PUBLIC, anon, authenticated;

grant all on table public.central_security_request_buckets_v2
  to service_role;

create or replace function public.consume_central_security_budget_v2(
  p_route_class text,
  p_client_key text,
  p_window_seconds integer,
  p_client_limit integer,
  p_global_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window_started_at timestamptz;
  v_client_slot text;
  v_global_shard text;
  v_client_count integer := 0;
  v_global_shard_count integer := 0;
  v_global_shard_limit integer := 0;
  v_allowed boolean;
  v_retry_after integer;
begin
  if p_route_class not in (
    'public_api',
    'api_write',
    'server_function',
    'risk_gate',
    'commercial',
    'payment',
    'internal'
  ) then
    raise exception 'INVALID_ROUTE_CLASS';
  end if;

  if p_client_key is null or p_client_key !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_CLIENT_KEY';
  end if;

  if p_window_seconds < 1 or p_window_seconds > 3600 then
    raise exception 'INVALID_WINDOW_SECONDS';
  end if;

  if p_client_limit < 1 or p_client_limit > 100000 then
    raise exception 'INVALID_CLIENT_LIMIT';
  end if;

  if p_global_limit < p_client_limit or p_global_limit > 1000000 then
    raise exception 'INVALID_GLOBAL_LIMIT';
  end if;

  v_window_started_at := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );

  -- Never persist the full client HMAC. Twenty-four bits gives 16,777,216
  -- bounded client slots per route class, sharply reducing accidental slot
  -- collisions for a one-million-agent population while keeping cardinality
  -- finite and privacy-preserving.
  v_client_slot := substr(p_client_key, 1, 6);

  -- Sixteen independently locked global shards remove the v1 single-row lock
  -- bottleneck. HMAC output is uniformly distributed, so legitimate traffic is
  -- expected to spread evenly even if callers rotate raw proxy/IP hints.
  v_global_shard := substr(p_client_key, 1, 1);
  v_global_shard_limit := greatest(
    1,
    ceil(p_global_limit::numeric / 16)::integer
  );

  v_retry_after := greatest(
    1,
    ceil(
      extract(
        epoch from (
          v_window_started_at
          + make_interval(secs => p_window_seconds)
          - v_now
        )
      )
    )::integer
  );

  -- Stable order: global shard first, then client. Requests on different shards
  -- no longer contend on one global advisory lock.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'geomacro-central-security-v2:global:' || p_route_class || ':' || v_global_shard,
      0
    )
  );

  insert into public.central_security_request_buckets_v2 (
    route_class,
    bucket_kind,
    bucket_key,
    window_started_at,
    request_count,
    blocked_count,
    updated_at
  ) values (
    p_route_class,
    'global_shard',
    v_global_shard,
    v_window_started_at,
    1,
    0,
    v_now
  )
  on conflict (route_class, bucket_kind, bucket_key)
  do update set
    window_started_at = excluded.window_started_at,
    request_count = case
      when public.central_security_request_buckets_v2.window_started_at = excluded.window_started_at
        then public.central_security_request_buckets_v2.request_count + 1
      else 1
    end,
    blocked_count = case
      when public.central_security_request_buckets_v2.window_started_at = excluded.window_started_at
        then public.central_security_request_buckets_v2.blocked_count
      else 0
    end,
    updated_at = excluded.updated_at
  returning request_count into v_global_shard_count;

  if v_global_shard_count > v_global_shard_limit then
    update public.central_security_request_buckets_v2
    set blocked_count = blocked_count + 1,
        updated_at = v_now
    where route_class = p_route_class
      and bucket_kind = 'global_shard'
      and bucket_key = v_global_shard;

    return jsonb_build_object(
      'ok', true,
      'allowed', false,
      'route_class', p_route_class,
      'client_count', null,
      'global_shard', v_global_shard,
      'global_shard_count', v_global_shard_count,
      'global_shard_limit', v_global_shard_limit,
      'retry_after_seconds', v_retry_after
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'geomacro-central-security-v2:client:' || p_route_class || ':' || v_client_slot,
      0
    )
  );

  insert into public.central_security_request_buckets_v2 (
    route_class,
    bucket_kind,
    bucket_key,
    window_started_at,
    request_count,
    blocked_count,
    updated_at
  ) values (
    p_route_class,
    'client',
    v_client_slot,
    v_window_started_at,
    1,
    0,
    v_now
  )
  on conflict (route_class, bucket_kind, bucket_key)
  do update set
    window_started_at = excluded.window_started_at,
    request_count = case
      when public.central_security_request_buckets_v2.window_started_at = excluded.window_started_at
        then public.central_security_request_buckets_v2.request_count + 1
      else 1
    end,
    blocked_count = case
      when public.central_security_request_buckets_v2.window_started_at = excluded.window_started_at
        then public.central_security_request_buckets_v2.blocked_count
      else 0
    end,
    updated_at = excluded.updated_at
  returning request_count into v_client_count;

  v_allowed := v_client_count <= p_client_limit;

  if not v_allowed then
    update public.central_security_request_buckets_v2
    set blocked_count = blocked_count + 1,
        updated_at = v_now
    where route_class = p_route_class
      and (
        (bucket_kind = 'global_shard' and bucket_key = v_global_shard)
        or
        (bucket_kind = 'client' and bucket_key = v_client_slot)
      );
  end if;

  return jsonb_build_object(
    'ok', true,
    'allowed', v_allowed,
    'route_class', p_route_class,
    'client_count', v_client_count,
    'global_shard', v_global_shard,
    'global_shard_count', v_global_shard_count,
    'global_shard_limit', v_global_shard_limit,
    'retry_after_seconds', v_retry_after
  );
end;
$$;

revoke all on function public.consume_central_security_budget_v2(
  text,
  text,
  integer,
  integer,
  integer
) from PUBLIC, anon, authenticated;

grant execute on function public.consume_central_security_budget_v2(
  text,
  text,
  integer,
  integer,
  integer
) to service_role;

comment on table public.central_security_request_buckets_v2 is
  'Server-only sharded distributed abuse-control counters for high-cardinality agents. Raw IPs, credentials, signatures, cookies, payment proofs and request bodies are never stored.';

comment on function public.consume_central_security_budget_v2(text, text, integer, integer, integer) is
  'Atomically consumes privacy-preserving 24-bit per-client slots and 16-way sharded global request budgets. Service-role only; aggregate global overshoot is bounded to at most 15 requests per window.';
