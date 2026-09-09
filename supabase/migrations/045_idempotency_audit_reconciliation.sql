-- =============================================================================
-- Geomacro Risk Gate idempotency/audit reconciliation hardening
--
-- PURPOSE
-- Canonical idempotency hashing and immutable audit hashing serve different
-- integrity purposes and must not be assumed to have byte-identical hashes.
--
-- The idempotency ledger hashes canonical JSON so semantically identical
-- requests survive object-key reordering. The immutable audit log preserves the
-- request hash produced by the existing audited request path. Recovery must
-- therefore bind to the exact idempotency claim identity and time window rather
-- than equating these two hash domains.
--
-- SECURITY / RELIABILITY BOUNDARY
-- - same client_id + request_id + different canonical request hash remains CONFLICT
-- - only a delivered, 2xx, non-authorizing audit created after the exact claim can
--   reconcile that claim
-- - an older audit with the same request_id cannot satisfy a newly-created claim
-- - immutable audit rows are not rewritten
-- - execution_authorized=false remains mandatory
-- =============================================================================

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

  -- Canonical request-hash mismatch is still the authoritative conflict test.
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

  -- Reconcile a delivered immutable audit created by this exact idempotency
  -- claim. Do not compare audit.request_hash with canonical request_hash: those
  -- are intentionally separate hash domains. created_at binds recovery to the
  -- current claim and excludes any older same-request_id audit after retention
  -- cleanup/re-creation.
  select *
  into v_audit
  from public.risk_gate_audit_log audit
  where
    audit.client_id = p_client_id
    and audit.request_id = p_request_id
    and audit.outcome = 'delivered'
    and audit.execution_authorized = false
    and audit.http_status between 200 and 299
    and audit.response_payload is not null
    and audit.created_at >= v_row.created_at
    and audit.created_at <= v_row.expires_at
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
      and idem.request_id = p_request_id
      and idem.request_hash = p_request_hash;

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
      and idem.request_id = p_request_id
      and idem.request_hash = p_request_hash
      and idem.state = 'processing';

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
  v_idem public.risk_gate_idempotency_keys%rowtype;
  v_audit public.risk_gate_audit_log%rowtype;
  v_updated integer := 0;
begin
  select *
  into v_idem
  from public.risk_gate_idempotency_keys idem
  where
    idem.client_id = p_client_id
    and idem.request_id = p_request_id
    and idem.request_hash = p_request_hash
    and idem.state = 'processing'
    and idem.claim_token = p_claim_token
  for update;

  if not found then
    return false;
  end if;

  select *
  into v_audit
  from public.risk_gate_audit_log audit
  where
    audit.audit_id = p_audit_id
    and audit.client_id = p_client_id
    and audit.request_id = p_request_id
    and audit.outcome = 'delivered'
    and audit.execution_authorized = false
    and audit.http_status between 200 and 299
    and audit.response_payload is not null
    and audit.created_at >= v_idem.created_at
    and audit.created_at <= v_idem.expires_at
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


comment on function public.claim_risk_gate_idempotency(text, text, text) is
  'Claims/replays Risk Gate requests using canonical request hashes while reconciling immutable delivered audits by exact client/request claim window instead of equating separate audit/idempotency hash domains.';

comment on function public.complete_risk_gate_idempotency(text, text, text, uuid, text) is
  'Completes only the owned canonical idempotency claim from a delivered non-authorizing immutable audit created within that exact claim window.';
