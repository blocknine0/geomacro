-- =============================================================================
-- Geomacro central security abuse-control ledger
--
-- Purpose:
-- - one distributed request budget shared by every application instance;
-- - brute-force / credential-spray / payment-probe throttling before expensive
--   authentication, settlement or intelligence work;
-- - no raw IP addresses, bearer tokens, signatures, cookies or customer
--   request bodies are persisted here;
-- - service-role only. Browser roles receive no table or RPC access.
--
-- This is one layer of defense. Edge/WAF controls and independent security
-- review remain separate launch gates.
-- =============================================================================

create table if not exists public.central_security_request_buckets (
  route_class text not null,
  bucket_kind text not null,
  bucket_key text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0,
  blocked_count integer not null default 0,
  updated_at timestamptz not null default now(),

  constraint central_security_request_buckets_pk
    primary key (route_class, bucket_kind, bucket_key, window_started_at),

  constraint central_security_request_buckets_route_class_check
    check (route_class in (
      'public_api',
      'api_write',
      'server_function',
      'risk_gate',
      'commercial',
      'payment',
      'internal'
    )),

  constraint central_security_request_buckets_kind_check
    check (bucket_kind in ('client', 'global')),

  constraint central_security_request_buckets_key_check
    check (
      (bucket_kind = 'global' and bucket_key = 'global')
      or
      (bucket_kind = 'client' and bucket_key ~ '^[0-9a-f]{64}$')
    ),

  constraint central_security_request_buckets_request_count_check
    check (request_count >= 0),

  constraint central_security_request_buckets_blocked_count_check
    check (blocked_count >= 0)
);

create index if not exists central_security_request_buckets_retention_idx
  on public.central_security_request_buckets (window_started_at);

alter table public.central_security_request_buckets
  enable row level security;

revoke all on table public.central_security_request_buckets
  from PUBLIC, anon, authenticated;

grant all on table public.central_security_request_buckets
  to service_role;

create or replace function public.consume_central_security_budget(
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
  v_client_count integer;
  v_global_count integer;
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

  -- Stable lock order prevents concurrent instances from overshooting either
  -- the global or client bucket during a burst.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'geomacro-central-security:global:' || p_route_class || ':' || v_window_started_at::text,
      0
    )
  );

  insert into public.central_security_request_buckets (
    route_class,
    bucket_kind,
    bucket_key,
    window_started_at,
    request_count,
    blocked_count,
    updated_at
  ) values (
    p_route_class,
    'global',
    'global',
    v_window_started_at,
    1,
    0,
    v_now
  )
  on conflict (route_class, bucket_kind, bucket_key, window_started_at)
  do update set
    request_count = public.central_security_request_buckets.request_count + 1,
    updated_at = excluded.updated_at
  returning request_count into v_global_count;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'geomacro-central-security:client:' || p_route_class || ':' || p_client_key || ':' || v_window_started_at::text,
      0
    )
  );

  insert into public.central_security_request_buckets (
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
    p_client_key,
    v_window_started_at,
    1,
    0,
    v_now
  )
  on conflict (route_class, bucket_kind, bucket_key, window_started_at)
  do update set
    request_count = public.central_security_request_buckets.request_count + 1,
    updated_at = excluded.updated_at
  returning request_count into v_client_count;

  v_allowed :=
    v_client_count <= p_client_limit
    and v_global_count <= p_global_limit;

  if not v_allowed then
    update public.central_security_request_buckets
    set blocked_count = blocked_count + 1,
        updated_at = v_now
    where route_class = p_route_class
      and window_started_at = v_window_started_at
      and (
        (bucket_kind = 'global' and bucket_key = 'global')
        or
        (bucket_kind = 'client' and bucket_key = p_client_key)
      );
  end if;

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

  -- Bounded retention without requiring a separate scheduler. Cleanup is
  -- intentionally probabilistic to avoid turning every request into a large
  -- delete scan.
  if random() < 0.01 then
    delete from public.central_security_request_buckets
    where window_started_at < v_now - interval '24 hours';
  end if;

  return jsonb_build_object(
    'ok', true,
    'allowed', v_allowed,
    'route_class', p_route_class,
    'client_count', v_client_count,
    'global_count', v_global_count,
    'retry_after_seconds', v_retry_after
  );
end;
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

comment on table public.central_security_request_buckets is
  'Server-only distributed abuse-control counters. Client identifiers are HMAC digests; raw IPs, credentials, signatures, cookies and request bodies are never stored.';

comment on function public.consume_central_security_budget(text, text, integer, integer, integer) is
  'Atomically consumes central per-client and global request budgets for Geomacro security classes. Service-role only.';
