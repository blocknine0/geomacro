-- =============================================================================
-- Geomacro Risk Gate external API infrastructure
--
-- Adds:
-- - server-only API client identities
-- - database-backed rate limiting
-- - immutable Risk Gate decision audit trail
--
-- Security boundary:
-- - no anon/authenticated access
-- - service-role only
-- - API secrets are never stored in plaintext
-- - audit rows are immutable
-- =============================================================================

create table if not exists public.risk_gate_api_clients (
  id uuid primary key default gen_random_uuid(),

  client_id text not null unique,
  display_name text not null,

  api_key_hash text not null unique,

  enabled boolean not null default true,

  requests_per_minute integer not null default 60
    check (
      requests_per_minute >= 1
      and requests_per_minute <= 10000
    ),

  created_at timestamptz not null default now(),
  disabled_at timestamptz,

  constraint risk_gate_api_clients_hash_check
    check (
      api_key_hash ~ '^[a-f0-9]{64}$'
    ),

  constraint risk_gate_api_clients_id_check
    check (
      client_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$'
    )
);


create table if not exists public.risk_gate_rate_limits (
  client_id text not null
    references public.risk_gate_api_clients(client_id)
    on delete cascade,

  window_started_at timestamptz not null,

  request_count integer not null default 0
    check (request_count >= 0),

  updated_at timestamptz not null default now(),

  primary key (
    client_id,
    window_started_at
  )
);


create table if not exists public.risk_gate_audit_log (
  id uuid primary key default gen_random_uuid(),

  audit_id text not null unique,

  client_id text not null,

  request_id text not null,

  subject_type text not null,
  subject_id text not null,

  risk_object_id text,

  methodology_version text,

  policy_id text,
  policy_version text,

  decision text,

  reason_codes jsonb not null
    default '[]'::jsonb,

  execution_authorized boolean not null
    default false,

  http_status integer not null,

  outcome text not null,

  request_hash text not null,
  response_hash text,

  request_payload jsonb not null,
  response_payload jsonb,

  evaluated_at timestamptz,
  created_at timestamptz not null default now(),

  constraint risk_gate_audit_subject_check
    check (
      subject_type in (
        'country',
        'unknown'
      )
    ),

  constraint risk_gate_audit_outcome_check
    check (
      outcome in (
        'delivered',
        'rejected',
        'failed'
      )
    ),

  constraint risk_gate_audit_http_status_check
    check (
      http_status >= 100
      and http_status <= 599
    ),

  constraint risk_gate_audit_request_hash_check
    check (
      request_hash ~ '^[a-f0-9]{64}$'
    ),

  constraint risk_gate_audit_response_hash_check
    check (
      response_hash is null
      or response_hash ~ '^[a-f0-9]{64}$'
    )
);


create index if not exists
  risk_gate_audit_client_created_idx
on public.risk_gate_audit_log (
  client_id,
  created_at desc
);


create index if not exists
  risk_gate_audit_subject_created_idx
on public.risk_gate_audit_log (
  subject_type,
  subject_id,
  created_at desc
);


create index if not exists
  risk_gate_audit_request_idx
on public.risk_gate_audit_log (
  request_id,
  created_at desc
);


create index if not exists
  risk_gate_rate_limits_updated_idx
on public.risk_gate_rate_limits (
  updated_at
);


-- ---------------------------------------------------------------------------
-- Immutable audit records
-- ---------------------------------------------------------------------------

create or replace function
  public.prevent_risk_gate_audit_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception
    'Risk Gate audit records are immutable';
end;
$$;


drop trigger if exists
  risk_gate_audit_immutable
on public.risk_gate_audit_log;


create trigger
  risk_gate_audit_immutable
before update or delete
on public.risk_gate_audit_log
for each row
execute function
  public.prevent_risk_gate_audit_mutation();


-- ---------------------------------------------------------------------------
-- Atomic database-backed rate limiter
-- ---------------------------------------------------------------------------

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
    date_trunc('minute', now());

  insert into public.risk_gate_rate_limits (
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
      public.risk_gate_rate_limits.request_count + 1,

    updated_at =
      now()

  returning
    public.risk_gate_rate_limits.request_count
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


-- ---------------------------------------------------------------------------
-- RLS / privilege hardening
-- ---------------------------------------------------------------------------

alter table
  public.risk_gate_api_clients
enable row level security;

alter table
  public.risk_gate_rate_limits
enable row level security;

alter table
  public.risk_gate_audit_log
enable row level security;


revoke all
on table public.risk_gate_api_clients
from PUBLIC, anon, authenticated;

revoke all
on table public.risk_gate_rate_limits
from PUBLIC, anon, authenticated;

revoke all
on table public.risk_gate_audit_log
from PUBLIC, anon, authenticated;


grant all
on table public.risk_gate_api_clients
to service_role;

grant all
on table public.risk_gate_rate_limits
to service_role;

grant all
on table public.risk_gate_audit_log
to service_role;


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


comment on table
  public.risk_gate_api_clients
is
  'Server-only external Risk Gate client identities. API keys are stored only as SHA-256 hashes.';


comment on table
  public.risk_gate_audit_log
is
  'Immutable audit trail for external Geomacro Risk Gate evaluations.';


comment on function
  public.consume_risk_gate_rate_limit(text, integer)
is
  'Atomic database-backed per-client Risk Gate request limiter.';
