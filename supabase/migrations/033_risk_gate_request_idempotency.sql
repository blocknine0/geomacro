-- =============================================================================
-- Geomacro Risk Gate request idempotency
--
-- PURPOSE
-- - exact same client/request_id + request hash can be replayed safely
-- - same client/request_id + different request hash is an explicit conflict
-- - concurrent duplicate evaluations are suppressed while one claim is active
-- - abandoned processing claims can be reclaimed after a conservative lease
-- - completed idempotency records expire after 24 hours
--
-- IMPORTANT
-- - this is an API reliability/integrity layer, not an execution authorizer
-- - the existing immutable risk_gate_audit_log remains the durable evidence log
-- - API keys remain stored/handled as hashes; no plaintext key is persisted here
-- =============================================================================

create table if not exists public.risk_gate_idempotency_keys (
  client_id text not null
    references public.risk_gate_api_clients(client_id)
    on delete cascade,

  request_id text not null,

  request_hash text not null,

  state text not null
    default 'processing'
    check (
      state in (
        'processing',
        'completed'
      )
    ),

  claim_token uuid,

  audit_id text
    references public.risk_gate_audit_log(audit_id),

  response_payload jsonb,

  http_status integer,

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now(),

  expires_at timestamptz not null
    default (
      now() + interval '24 hours'
    ),

  primary key (
    client_id,
    request_id
  ),

  constraint risk_gate_idempotency_request_id_check
    check (
      char_length(request_id) between 1 and 256
    ),

  constraint risk_gate_idempotency_hash_check
    check (
      request_hash ~ '^[a-f0-9]{64}$'
    ),

  constraint risk_gate_idempotency_completed_shape_check
    check (
      (
        state = 'processing'
        and claim_token is not null
        and audit_id is null
        and response_payload is null
        and http_status is null
      )
      or
      (
        state = 'completed'
        and claim_token is null
        and audit_id is not null
        and response_payload is not null
        and http_status between 200 and 299
      )
    )
);


create index if not exists
  risk_gate_idempotency_expiry_idx
on public.risk_gate_idempotency_keys (
  client_id,
  expires_at
);


-- ---------------------------------------------------------------------------
-- Future delivered decisions: at most one delivered audit row for a given
-- client/request_id within the 24-hour idempotency window.
--
-- Advisory locking closes the race that a plain trigger existence check would
-- otherwise have under concurrent inserts. Historical duplicate rows, if any,
-- do not make this migration fail; enforcement applies to new inserts.
-- ---------------------------------------------------------------------------

create or replace function
  public.prevent_duplicate_recent_risk_gate_delivery()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.outcome <> 'delivered' then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtext(
      new.client_id || chr(31) || new.request_id
    )
  );

  if exists (
    select 1
    from public.risk_gate_audit_log existing
    where
      existing.client_id = new.client_id
      and existing.request_id = new.request_id
      and existing.outcome = 'delivered'
      and existing.created_at >=
        now() - interval '24 hours'
  ) then
    raise exception
      'duplicate delivered Risk Gate request_id within idempotency window';
  end if;

  return new;
end;
$$;


drop trigger if exists
  risk_gate_prevent_duplicate_recent_delivery
on public.risk_gate_audit_log;


create trigger
  risk_gate_prevent_duplicate_recent_delivery
before insert
on public.risk_gate_audit_log
for each row
execute function
  public.prevent_duplicate_recent_risk_gate_delivery();


-- ---------------------------------------------------------------------------
-- Claim a request ID.
--
-- CLAIMED     -> caller owns claim_token and may evaluate
-- REPLAY      -> return existing completed response
-- CONFLICT    -> same request_id was used with different payload hash
-- IN_PROGRESS -> same request is already being evaluated
--
-- The processing lease is five minutes. This is intentionally longer than the
-- expected edge request lifetime so a normal slow request is not concurrently
-- reclaimed. A completed immutable audit row is reconciled before lease logic.
-- ---------------------------------------------------------------------------

create or replace function
  public.claim_risk_gate_idempotency(
    p_client_id text,
    p_request_id text,
    p_request_hash text
  )
returns table (
  disposition text,
  claim_token uuid,
  audit_id text,
  response_payload jsonb,
  http_status integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_token uuid := gen_random_uuid();
  v_inserted integer := 0;
  v_row public.risk_gate_idempotency_keys%rowtype;
  v_audit public.risk_gate_audit_log%rowtype;
begin
  if
    p_client_id is null
    or char_length(p_client_id) < 1
    or p_request_id is null
    or char_length(p_request_id) < 1
    or char_length(p_request_id) > 256
    or p_request_hash !~ '^[a-f0-9]{64}$'
  then
    raise exception
      'invalid Risk Gate idempotency claim';
  end if;

  if not exists (
    select 1
    from public.risk_gate_api_clients client
    where
      client.client_id = p_client_id
      and client.enabled = true
  ) then
    raise exception
      'invalid or disabled Risk Gate API client';
  end if;

  -- Opportunistic bounded-retention cleanup for this client.
  delete from public.risk_gate_idempotency_keys expired
  where
    expired.client_id = p_client_id
    and expired.expires_at <= v_now;

  insert into public.risk_gate_idempotency_keys (
    client_id,
    request_id,
    request_hash,
    state,
    claim_token,
    created_at,
    updated_at,
    expires_at
  )
  values (
    p_client_id,
    p_request_id,
    p_request_hash,
    'processing',
    v_token,
    v_now,
    v_now,
    v_now + interval '24 hours'
  )
  on conflict (
    client_id,
    request_id
  )
  do nothing;

  get diagnostics
    v_inserted = row_count;

  if v_inserted = 1 then
    return query
    select
      'CLAIMED'::text,
      v_token,
      null::text,
      null::jsonb,
      null::integer;
    return;
  end if;

  select *
  into v_row
  from public.risk_gate_idempotency_keys existing
  where
    existing.client_id = p_client_id
    and existing.request_id = p_request_id
  for update;

  if not found then
    raise exception
      'Risk Gate idempotency row disappeared during claim';
  end if;

  if v_row.request_hash <> p_request_hash then
    return query
    select
      'CONFLICT'::text,
      null::uuid,
      v_row.audit_id,
      null::jsonb,
      null::integer;
    return;
  end if;

  -- Reconcile a delivered audit row first. This repairs the narrow failure
  -- window where audit persistence succeeded but application completion of the
  -- idempotency row did not.
  select *
  into v_audit
  from public.risk_gate_audit_log audit
  where
    audit.client_id = p_client_id
    and audit.request_id = p_request_id
    and audit.request_hash = p_request_hash
    and audit.outcome = 'delivered'
    and audit.created_at >=
      v_now - interval '24 hours'
  order by
    audit.created_at desc
  limit 1;

  if found then
    update public.risk_gate_idempotency_keys idem
    set
      state = 'completed',
      claim_token = null,
      audit_id = v_audit.audit_id,
      response_payload = v_audit.response_payload,
      http_status = v_audit.http_status,
      updated_at = v_now
    where
      idem.client_id = p_client_id
      and idem.request_id = p_request_id;

    return query
    select
      'REPLAY'::text,
      null::uuid,
      v_audit.audit_id,
      v_audit.response_payload,
      v_audit.http_status;
    return;
  end if;

  if v_row.state = 'completed' then
    return query
    select
      'REPLAY'::text,
      null::uuid,
      v_row.audit_id,
      v_row.response_payload,
      v_row.http_status;
    return;
  end if;

  if
    v_row.state = 'processing'
    and v_row.updated_at <=
      v_now - interval '5 minutes'
  then
    update public.risk_gate_idempotency_keys idem
    set
      claim_token = v_token,
      updated_at = v_now,
      expires_at =
        v_now + interval '24 hours'
    where
      idem.client_id = p_client_id
      and idem.request_id = p_request_id;

    return query
    select
      'CLAIMED'::text,
      v_token,
      null::text,
      null::jsonb,
      null::integer;
    return;
  end if;

  return query
  select
    'IN_PROGRESS'::text,
    null::uuid,
    null::text,
    null::jsonb,
    null::integer;
end;
$$;


-- ---------------------------------------------------------------------------
-- Complete only the currently owned claim, and only from an immutable
-- delivered audit row that matches client/request/hash.
-- ---------------------------------------------------------------------------

create or replace function
  public.complete_risk_gate_idempotency(
    p_client_id text,
    p_request_id text,
    p_request_hash text,
    p_claim_token uuid,
    p_audit_id text
  )
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_audit public.risk_gate_audit_log%rowtype;
  v_updated integer := 0;
begin
  select *
  into v_audit
  from public.risk_gate_audit_log audit
  where
    audit.audit_id = p_audit_id
    and audit.client_id = p_client_id
    and audit.request_id = p_request_id
    and audit.request_hash = p_request_hash
    and audit.outcome = 'delivered'
  limit 1;

  if not found then
    return false;
  end if;

  update public.risk_gate_idempotency_keys idem
  set
    state = 'completed',
    claim_token = null,
    audit_id = v_audit.audit_id,
    response_payload = v_audit.response_payload,
    http_status = v_audit.http_status,
    updated_at = now()
  where
    idem.client_id = p_client_id
    and idem.request_id = p_request_id
    and idem.request_hash = p_request_hash
    and idem.state = 'processing'
    and idem.claim_token = p_claim_token;

  get diagnostics
    v_updated = row_count;

  return v_updated = 1;
end;
$$;


create or replace function
  public.release_risk_gate_idempotency(
    p_client_id text,
    p_request_id text,
    p_request_hash text,
    p_claim_token uuid
  )
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
begin
  delete from public.risk_gate_idempotency_keys idem
  where
    idem.client_id = p_client_id
    and idem.request_id = p_request_id
    and idem.request_hash = p_request_hash
    and idem.state = 'processing'
    and idem.claim_token = p_claim_token;

  get diagnostics
    v_deleted = row_count;

  return v_deleted = 1;
end;
$$;


-- ---------------------------------------------------------------------------
-- RLS / privilege hardening
-- ---------------------------------------------------------------------------

alter table public.risk_gate_idempotency_keys
  enable row level security;

revoke all
on table public.risk_gate_idempotency_keys
from PUBLIC, anon, authenticated;

grant all
on table public.risk_gate_idempotency_keys
to service_role;

revoke all
on function public.claim_risk_gate_idempotency(
  text,
  text,
  text
)
from PUBLIC, anon, authenticated;

revoke all
on function public.complete_risk_gate_idempotency(
  text,
  text,
  text,
  uuid,
  text
)
from PUBLIC, anon, authenticated;

revoke all
on function public.release_risk_gate_idempotency(
  text,
  text,
  text,
  uuid
)
from PUBLIC, anon, authenticated;

grant execute
on function public.claim_risk_gate_idempotency(
  text,
  text,
  text
)
to service_role;

grant execute
on function public.complete_risk_gate_idempotency(
  text,
  text,
  text,
  uuid,
  text
)
to service_role;

grant execute
on function public.release_risk_gate_idempotency(
  text,
  text,
  text,
  uuid
)
to service_role;


comment on table public.risk_gate_idempotency_keys is
  '24-hour server-only Risk Gate idempotency ledger. Prevents conflicting request_id reuse and supports safe exact-response replay.';

comment on function public.claim_risk_gate_idempotency(text, text, text) is
  'Claims or resolves a Risk Gate client/request_id within the 24-hour idempotency window.';
