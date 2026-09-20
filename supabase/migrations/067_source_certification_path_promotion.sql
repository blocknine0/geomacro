-- =============================================================================
-- Geomacro source certification path promotion guard
--
-- Explicit, audited, fail-closed promotion for source-universe queue paths.
-- A caller may only promote a path after all required source-level evidence
-- dimensions have already passed and a path-specific certification attestation
-- is supplied.
-- =============================================================================

begin;

alter table public.live_source_certification_queue
  add column if not exists evidence_ref text,
  add column if not exists certified_at timestamptz,
  add column if not exists certified_by text,
  add column if not exists certification_hash text;

create index if not exists live_source_certification_queue_certified_idx
  on public.live_source_certification_queue(certification_state, fail_closed);

create or replace function public.certify_live_source_queue_path(
  p_queue_key text,
  p_endpoint_check text,
  p_rights_check text,
  p_schema_check text,
  p_freshness_check text,
  p_independence_check text,
  p_evidence_ref text,
  p_certification_hash text,
  p_certified_by text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.live_source_certification_queue%rowtype;
  c public.live_source_certification_records%rowtype;
  now_ts timestamptz := now();
begin
  select *
    into q
  from public.live_source_certification_queue
  where queue_key = p_queue_key
  for update;

  if not found then
    raise exception 'SOURCE_CERTIFICATION_QUEUE_NOT_FOUND';
  end if;

  select *
    into c
  from public.live_source_certification_records
  where source_id = q.source_id
  for update;

  if not found then
    raise exception 'SOURCE_CERTIFICATION_RECORD_NOT_FOUND';
  end if;

  if c.certification_state <> 'CERTIFIED' then
    raise exception 'SOURCE_LEVEL_CERTIFICATION_REQUIRED';
  end if;

  if p_endpoint_check <> 'PASS'
     or p_rights_check not in ('COMMERCIAL_OK','DERIVED_ONLY')
     or p_schema_check <> 'PASS'
     or p_freshness_check <> 'PASS'
     or p_independence_check <> 'PASS' then
    raise exception 'PATH_CERTIFICATION_EVIDENCE_INCOMPLETE';
  end if;

  if coalesce(length(trim(p_evidence_ref)), 0) < 1 then
    raise exception 'CERTIFICATION_EVIDENCE_REF_REQUIRED';
  end if;

  if p_certification_hash !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'CERTIFICATION_HASH_MUST_BE_SHA256_HEX';
  end if;

  if coalesce(length(trim(p_certified_by)), 0) < 1 then
    raise exception 'CERTIFIED_BY_REQUIRED';
  end if;

  update public.live_source_certification_queue
  set
    certification_state = 'CERTIFIED',
    fail_closed = false,
    endpoint_check = 'PASS',
    rights_check = p_rights_check,
    schema_check = 'PASS',
    freshness_check = 'PASS',
    independence_check = 'PASS',
    evidence_ref = trim(p_evidence_ref),
    certified_at = now_ts,
    certified_by = trim(p_certified_by),
    certification_hash = lower(p_certification_hash),
    last_attempt_at = now_ts,
    updated_at = now_ts
  where queue_key = p_queue_key;

  return jsonb_build_object(
    'queue_key', p_queue_key,
    'source_id', q.source_id,
    'certification_state', 'CERTIFIED',
    'fail_closed', false,
    'certified_at', now_ts,
    'certified_by', trim(p_certified_by),
    'certification_hash', lower(p_certification_hash)
  );
end;
$$;

comment on function public.certify_live_source_queue_path is
 'Fail-closed path promotion. Requires an already-CERTIFIED source record plus PASS endpoint/schema/freshness/independence, commercial/derived rights, evidence reference, SHA-256 attestation and explicit actor.';

revoke all on function public.certify_live_source_queue_path(
  text,text,text,text,text,text,text,text,text
) from public, anon, authenticated;

grant execute on function public.certify_live_source_queue_path(
  text,text,text,text,text,text,text,text,text
) to service_role;

commit;
