-- =============================================================================
-- Geomacro signed structured webhook event outbox
--
-- PURPOSE
-- - persist customer-deliverable structured events durably beside Risk Gate audit
-- - keep webhook content cryptographically signed and independently verifiable
-- - preserve audit + event atomicity when webhook outbox mode is enabled
--
-- SECURITY / PRODUCT BOUNDARY
-- - no outbound HTTP delivery is implemented by this migration
-- - no callback URL, DNS lookup, redirect or arbitrary network fetch occurs here
-- - only structured Risk Gate decision context is stored in webhook payloads
-- - execution_authorized must remain false in both audit and webhook event
-- - service-role only; anon/authenticated receive no table or RPC access
-- =============================================================================

create table if not exists public.webhook_event_outbox (
  id uuid primary key default gen_random_uuid(),

  event_id text not null unique,

  audit_id text not null unique
    references public.risk_gate_audit_log(audit_id),

  client_id text not null
    references public.risk_gate_api_clients(client_id),

  schema_version text not null
    check (
      schema_version = 'geomacro-webhook-1.0'
    ),

  event_type text not null
    check (
      event_type = 'risk_gate.decision.created'
    ),

  occurred_at timestamptz not null,

  payload jsonb not null,

  payload_hash text not null
    check (
      payload_hash ~ '^[a-f0-9]{64}$'
    ),

  signature_scheme text not null
    check (
      signature_scheme = 'Ed25519'
    ),

  signing_key_id text not null
    check (
      signing_key_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    ),

  signature text not null
    check (
      char_length(signature) between 80 and 256
    ),

  created_at timestamptz not null default now()
);


create index if not exists
  webhook_event_outbox_client_created_idx
on public.webhook_event_outbox (
  client_id,
  created_at desc
);


create index if not exists
  webhook_event_outbox_type_created_idx
on public.webhook_event_outbox (
  event_type,
  created_at desc
);


-- Signed event rows are source evidence. Future delivery-attempt state belongs
-- in a separate delivery table so the signed envelope itself remains immutable.
create or replace function
  public.prevent_webhook_event_outbox_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception
    'Webhook event outbox records are immutable';
end;
$$;


create trigger
  webhook_event_outbox_immutable
before update or delete
on public.webhook_event_outbox
for each row
execute function
  public.prevent_webhook_event_outbox_mutation();


-- ---------------------------------------------------------------------------
-- Atomic delivered-audit + signed-webhook persistence.
--
-- The application computes and self-verifies the Ed25519 signature before
-- calling this RPC. SQL then fails closed on envelope shape/alignment and writes
-- both records in one transaction. Existing audit minimization and duplicate-
-- delivery triggers still execute because this function inserts through the
-- canonical risk_gate_audit_log table.
-- ---------------------------------------------------------------------------

create or replace function
  public.persist_risk_gate_audit_with_webhook_event(
    p_audit jsonb,
    p_webhook_event jsonb
  )
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_audit_id text;
  v_client_id text;
  v_request_id text;
  v_event_id text;
  v_payload_hash text;
  v_signing_key_id text;
  v_signature text;
begin
  if
    p_audit is null
    or jsonb_typeof(p_audit) <> 'object'
    or p_webhook_event is null
    or jsonb_typeof(p_webhook_event) <> 'object'
  then
    raise exception
      'invalid Risk Gate webhook persistence payload';
  end if;

  v_audit_id :=
    nullif(trim(p_audit ->> 'audit_id'), '');
  v_client_id :=
    nullif(trim(p_audit ->> 'client_id'), '');
  v_request_id :=
    nullif(trim(p_audit ->> 'request_id'), '');
  v_event_id :=
    nullif(trim(p_webhook_event ->> 'event_id'), '');
  v_payload_hash :=
    nullif(trim(p_webhook_event #>> '{integrity,payload_hash}'), '');
  v_signing_key_id :=
    nullif(trim(p_webhook_event #>> '{integrity,signing_key_id}'), '');
  v_signature :=
    nullif(trim(p_webhook_event #>> '{integrity,signature}'), '');

  if
    v_audit_id is null
    or v_client_id is null
    or v_request_id is null
    or v_event_id is null
    or v_payload_hash is null
    or v_signing_key_id is null
    or v_signature is null
  then
    raise exception
      'Risk Gate webhook persistence identifiers are required';
  end if;

  if
    p_audit ->> 'outcome' <> 'delivered'
    or p_audit -> 'execution_authorized' is distinct from 'false'::jsonb
    or p_webhook_event -> 'data' -> 'execution_authorized'
      is distinct from 'false'::jsonb
  then
    raise exception
      'Risk Gate webhook persistence cannot authorize execution';
  end if;

  if
    p_webhook_event ->> 'schema_version' <> 'geomacro-webhook-1.0'
    or p_webhook_event ->> 'event_type' <> 'risk_gate.decision.created'
    or p_webhook_event #>> '{integrity,canonicalization}'
      <> 'geomacro-canonical-json-1.0'
    or p_webhook_event #>> '{integrity,signature_scheme}' <> 'Ed25519'
    or v_payload_hash !~ '^[a-f0-9]{64}$'
    or v_signing_key_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or char_length(v_signature) not between 80 and 256
  then
    raise exception
      'Risk Gate webhook integrity envelope is invalid';
  end if;

  if
    p_webhook_event ->> 'client_id' <> v_client_id
    or p_webhook_event #>> '{data,audit_id}' <> v_audit_id
    or p_webhook_event #>> '{data,request_id}' <> v_request_id
  then
    raise exception
      'Risk Gate webhook event does not align with audit record';
  end if;

  if
    jsonb_typeof(p_audit -> 'reason_codes') <> 'array'
    or jsonb_typeof(p_audit -> 'request_payload') is null
    or jsonb_typeof(p_webhook_event -> 'data') <> 'object'
    or jsonb_typeof(p_webhook_event -> 'integrity') <> 'object'
  then
    raise exception
      'Risk Gate webhook structured payload shape is invalid';
  end if;

  insert into public.risk_gate_audit_log (
    audit_id,
    client_id,
    request_id,
    subject_type,
    subject_id,
    risk_object_id,
    methodology_version,
    policy_id,
    policy_version,
    decision,
    reason_codes,
    execution_authorized,
    http_status,
    outcome,
    request_hash,
    response_hash,
    request_payload,
    response_payload,
    evaluated_at
  )
  values (
    v_audit_id,
    v_client_id,
    v_request_id,
    p_audit ->> 'subject_type',
    p_audit ->> 'subject_id',
    nullif(p_audit ->> 'risk_object_id', ''),
    nullif(p_audit ->> 'methodology_version', ''),
    nullif(p_audit ->> 'policy_id', ''),
    nullif(p_audit ->> 'policy_version', ''),
    nullif(p_audit ->> 'decision', ''),
    p_audit -> 'reason_codes',
    false,
    (p_audit ->> 'http_status')::integer,
    'delivered',
    p_audit ->> 'request_hash',
    nullif(p_audit ->> 'response_hash', ''),
    p_audit -> 'request_payload',
    p_audit -> 'response_payload',
    nullif(p_audit ->> 'evaluated_at', '')::timestamptz
  );

  insert into public.webhook_event_outbox (
    event_id,
    audit_id,
    client_id,
    schema_version,
    event_type,
    occurred_at,
    payload,
    payload_hash,
    signature_scheme,
    signing_key_id,
    signature
  )
  values (
    v_event_id,
    v_audit_id,
    v_client_id,
    p_webhook_event ->> 'schema_version',
    p_webhook_event ->> 'event_type',
    (p_webhook_event ->> 'occurred_at')::timestamptz,
    p_webhook_event,
    v_payload_hash,
    p_webhook_event #>> '{integrity,signature_scheme}',
    v_signing_key_id,
    v_signature
  );

  return v_audit_id;
end;
$$;


-- ---------------------------------------------------------------------------
-- RLS / privilege hardening
-- ---------------------------------------------------------------------------

alter table public.webhook_event_outbox
  enable row level security;

revoke all
on table public.webhook_event_outbox
from PUBLIC, anon, authenticated;

grant all
on table public.webhook_event_outbox
to service_role;

revoke all
on function public.persist_risk_gate_audit_with_webhook_event(
  jsonb,
  jsonb
)
from PUBLIC, anon, authenticated;

grant execute
on function public.persist_risk_gate_audit_with_webhook_event(
  jsonb,
  jsonb
)
to service_role;


comment on table public.webhook_event_outbox is
  'Immutable signed structured webhook event source. No outbound network delivery is performed by this table or migration.';

comment on function public.persist_risk_gate_audit_with_webhook_event(jsonb, jsonb) is
  'Atomically persists a delivered Risk Gate audit row and its signed structured webhook event. Always preserves execution_authorized=false.';
