-- =============================================================================
-- Testnet developer credential lifecycle hardening
--
-- Security goals:
-- - one usable wallet-issued Testnet credential per principal
-- - transactional issue / revoke / rotate operations
-- - least-privilege scope validation
-- - append-only lifecycle evidence without storing plaintext secrets
-- - principal-row locking so concurrent requests cannot mint duplicate live keys
-- =============================================================================

create table if not exists public.commercial_api_credential_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  principal_id uuid not null references public.commercial_principals(id) on delete cascade,
  credential_id uuid references public.commercial_api_credentials(id) on delete set null,
  previous_credential_id uuid references public.commercial_api_credentials(id) on delete set null,
  key_id text,
  event_type text not null,
  actor_type text not null default 'principal',
  metadata jsonb not null default '{}'::jsonb,
  constraint commercial_api_credential_lifecycle_event_type_check
    check (event_type in ('issued','revoked','rotated','expired_cleanup')),
  constraint commercial_api_credential_lifecycle_actor_type_check
    check (actor_type in ('principal','system','operator')),
  constraint commercial_api_credential_lifecycle_key_id_check
    check (key_id is null or char_length(key_id) between 8 and 96)
);

create index if not exists commercial_api_credential_lifecycle_principal_idx
  on public.commercial_api_credential_lifecycle_events (principal_id, occurred_at desc);
create index if not exists commercial_api_credential_lifecycle_credential_idx
  on public.commercial_api_credential_lifecycle_events (credential_id, occurred_at desc);

alter table public.commercial_api_credential_lifecycle_events enable row level security;
revoke all on table public.commercial_api_credential_lifecycle_events from PUBLIC, anon, authenticated;
revoke all on table public.commercial_api_credential_lifecycle_events from service_role;
grant select on table public.commercial_api_credential_lifecycle_events to service_role;

-- Normalize stale mappings whose backing credential is no longer usable. This is
-- lifecycle state normalization, not deletion; the old credential remains auditable.
with stale as (
  select t.id, t.principal_id, t.commercial_api_credential_id, c.key_id
  from public.testnet_developer_credentials t
  join public.commercial_api_credentials c on c.id = t.commercial_api_credential_id
  where t.enabled is true
    and t.revoked_at is null
    and (
      c.enabled is not true
      or c.revoked_at is not null
      or (c.expires_at is not null and c.expires_at <= now())
    )
), updated as (
  update public.testnet_developer_credentials t
  set enabled = false,
      revoked_at = coalesce(t.revoked_at, now())
  from stale s
  where t.id = s.id
  returning t.principal_id, t.commercial_api_credential_id
)
insert into public.commercial_api_credential_lifecycle_events (
  principal_id,
  credential_id,
  key_id,
  event_type,
  actor_type,
  metadata
)
select
  u.principal_id,
  u.commercial_api_credential_id,
  s.key_id,
  'expired_cleanup',
  'system',
  jsonb_build_object('reason', 'backing_credential_not_usable_at_migration_928')
from updated u
join stale s on s.commercial_api_credential_id = u.commercial_api_credential_id;

-- Fail closed if pre-existing data violates the intended single-live-key model.
do $$
begin
  if exists (
    select 1
    from public.testnet_developer_credentials t
    join public.commercial_api_credentials c on c.id = t.commercial_api_credential_id
    where t.enabled is true
      and t.revoked_at is null
      and c.enabled is true
      and c.revoked_at is null
      and (c.expires_at is null or c.expires_at > now())
    group by t.principal_id
    having count(*) > 1
  ) then
    raise exception 'Migration 928 refused: duplicate usable Testnet developer credentials exist for at least one principal';
  end if;
end;
$$;

-- Mapping-level uniqueness is safe after stale normalization. All lifecycle RPCs
-- below clear the old mapping before inserting a replacement.
create unique index if not exists testnet_developer_one_live_mapping_per_principal
  on public.testnet_developer_credentials (principal_id)
  where enabled is true and revoked_at is null;

create or replace function public.issue_testnet_developer_credential(
  p_principal_id uuid,
  p_key_id text,
  p_api_key_hash text,
  p_scopes text[],
  p_expires_at timestamptz,
  p_label text,
  p_integration_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_principal_id uuid;
  v_credential_id uuid;
  v_mapping_id uuid;
begin
  if p_principal_id is null
    or p_key_id !~ '^gmk_test_[A-Za-z0-9_-]{20,}$'
    or p_api_key_hash !~ '^[0-9a-f]{64}$'
    or p_expires_at is null
    or p_expires_at <= now()
    or p_label is null
    or char_length(trim(p_label)) < 2
    or char_length(trim(p_label)) > 80
    or p_integration_type not in ('product_api','ai_agent','automation','demo')
    or p_scopes is null
    or not (p_scopes <@ array[
      'commercial:read',
      'testnet:structured',
      'testnet:risk-object',
      'testnet:risk-gate',
      'testnet:agent'
    ]::text[])
    or not ('commercial:read' = any(p_scopes))
  then
    return jsonb_build_object('ok', false, 'code', 'INVALID_TESTNET_DEVELOPER_CREDENTIAL_INPUT');
  end if;

  select id into v_principal_id
  from public.commercial_principals
  where id = p_principal_id and status = 'active'
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'PRINCIPAL_NOT_ACTIVE');
  end if;

  -- Mark any expired/disabled backing mappings inactive before enforcing the
  -- one-live-key invariant. Principal row lock serializes concurrent issuance.
  update public.testnet_developer_credentials t
  set enabled = false,
      revoked_at = coalesce(t.revoked_at, now())
  from public.commercial_api_credentials c
  where t.principal_id = p_principal_id
    and t.commercial_api_credential_id = c.id
    and t.enabled is true
    and t.revoked_at is null
    and (
      c.enabled is not true
      or c.revoked_at is not null
      or (c.expires_at is not null and c.expires_at <= now())
    );

  if exists (
    select 1
    from public.testnet_developer_credentials t
    join public.commercial_api_credentials c on c.id = t.commercial_api_credential_id
    where t.principal_id = p_principal_id
      and t.enabled is true
      and t.revoked_at is null
      and c.enabled is true
      and c.revoked_at is null
      and (c.expires_at is null or c.expires_at > now())
  ) then
    return jsonb_build_object('ok', false, 'code', 'TESTNET_DEVELOPER_KEY_ALREADY_EXISTS');
  end if;

  insert into public.commercial_api_credentials (
    principal_id,
    key_id,
    api_key_hash,
    enabled,
    scopes,
    expires_at
  ) values (
    p_principal_id,
    p_key_id,
    p_api_key_hash,
    true,
    p_scopes,
    p_expires_at
  )
  returning id into v_credential_id;

  insert into public.testnet_developer_credentials (
    principal_id,
    commercial_api_credential_id,
    label,
    integration_type,
    enabled
  ) values (
    p_principal_id,
    v_credential_id,
    trim(p_label),
    p_integration_type,
    true
  )
  returning id into v_mapping_id;

  insert into public.commercial_api_credential_lifecycle_events (
    principal_id,
    credential_id,
    key_id,
    event_type,
    actor_type,
    metadata
  ) values (
    p_principal_id,
    v_credential_id,
    p_key_id,
    'issued',
    'principal',
    jsonb_build_object(
      'mapping_id', v_mapping_id,
      'integration_type', p_integration_type,
      'scopes', to_jsonb(p_scopes)
    )
  );

  return jsonb_build_object(
    'ok', true,
    'credential_id', v_credential_id,
    'key_id', p_key_id,
    'expires_at', p_expires_at,
    'scopes', to_jsonb(p_scopes)
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'TESTNET_DEVELOPER_KEY_CONFLICT');
end;
$$;

create or replace function public.revoke_testnet_developer_credential(
  p_principal_id uuid,
  p_credential_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_principal_id uuid;
  v_mapping public.testnet_developer_credentials%rowtype;
  v_credential public.commercial_api_credentials%rowtype;
  v_now timestamptz := now();
begin
  select id into v_principal_id
  from public.commercial_principals
  where id = p_principal_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'TESTNET_DEVELOPER_KEY_NOT_FOUND');
  end if;

  select * into v_mapping
  from public.testnet_developer_credentials
  where principal_id = p_principal_id
    and commercial_api_credential_id = p_credential_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'TESTNET_DEVELOPER_KEY_NOT_FOUND');
  end if;

  select * into v_credential
  from public.commercial_api_credentials
  where id = p_credential_id
    and principal_id = p_principal_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'TESTNET_DEVELOPER_KEY_NOT_FOUND');
  end if;

  if v_mapping.enabled is not true
    or v_mapping.revoked_at is not null
    or v_credential.enabled is not true
    or v_credential.revoked_at is not null
  then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'credential_id', p_credential_id,
      'revoked_at', coalesce(v_mapping.revoked_at, v_credential.revoked_at)
    );
  end if;

  update public.commercial_api_credentials
  set enabled = false, revoked_at = v_now
  where id = p_credential_id and principal_id = p_principal_id;

  update public.testnet_developer_credentials
  set enabled = false, revoked_at = v_now
  where id = v_mapping.id;

  insert into public.commercial_api_credential_lifecycle_events (
    principal_id,
    credential_id,
    key_id,
    event_type,
    actor_type
  ) values (
    p_principal_id,
    p_credential_id,
    v_credential.key_id,
    'revoked',
    'principal'
  );

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'credential_id', p_credential_id,
    'revoked_at', v_now
  );
end;
$$;

create or replace function public.rotate_testnet_developer_credential(
  p_principal_id uuid,
  p_old_credential_id uuid,
  p_new_key_id text,
  p_new_api_key_hash text,
  p_new_scopes text[],
  p_new_expires_at timestamptz,
  p_label text,
  p_integration_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_principal_id uuid;
  v_old_mapping public.testnet_developer_credentials%rowtype;
  v_old_credential public.commercial_api_credentials%rowtype;
  v_new_credential_id uuid;
  v_new_mapping_id uuid;
  v_now timestamptz := now();
begin
  if p_new_key_id !~ '^gmk_test_[A-Za-z0-9_-]{20,}$'
    or p_new_api_key_hash !~ '^[0-9a-f]{64}$'
    or p_new_expires_at is null
    or p_new_expires_at <= v_now
    or p_label is null
    or char_length(trim(p_label)) < 2
    or char_length(trim(p_label)) > 80
    or p_integration_type not in ('product_api','ai_agent','automation','demo')
    or p_new_scopes is null
    or not (p_new_scopes <@ array[
      'commercial:read',
      'testnet:structured',
      'testnet:risk-object',
      'testnet:risk-gate',
      'testnet:agent'
    ]::text[])
    or not ('commercial:read' = any(p_new_scopes))
  then
    return jsonb_build_object('ok', false, 'code', 'INVALID_TESTNET_DEVELOPER_CREDENTIAL_INPUT');
  end if;

  select id into v_principal_id
  from public.commercial_principals
  where id = p_principal_id and status = 'active'
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'PRINCIPAL_NOT_ACTIVE');
  end if;

  select * into v_old_mapping
  from public.testnet_developer_credentials
  where principal_id = p_principal_id
    and commercial_api_credential_id = p_old_credential_id
  for update;
  if not found
    or v_old_mapping.enabled is not true
    or v_old_mapping.revoked_at is not null
  then
    return jsonb_build_object('ok', false, 'code', 'TESTNET_DEVELOPER_KEY_NOT_ACTIVE');
  end if;

  select * into v_old_credential
  from public.commercial_api_credentials
  where id = p_old_credential_id
    and principal_id = p_principal_id
  for update;
  if not found
    or v_old_credential.enabled is not true
    or v_old_credential.revoked_at is not null
    or (v_old_credential.expires_at is not null and v_old_credential.expires_at <= v_now)
  then
    return jsonb_build_object('ok', false, 'code', 'TESTNET_DEVELOPER_KEY_NOT_ACTIVE');
  end if;

  insert into public.commercial_api_credentials (
    principal_id,
    key_id,
    api_key_hash,
    enabled,
    scopes,
    expires_at
  ) values (
    p_principal_id,
    p_new_key_id,
    p_new_api_key_hash,
    true,
    p_new_scopes,
    p_new_expires_at
  )
  returning id into v_new_credential_id;

  -- Revoke old mapping before creating the new mapping so the partial unique
  -- index never observes two live mappings inside the transaction.
  update public.commercial_api_credentials
  set enabled = false, revoked_at = v_now
  where id = p_old_credential_id and principal_id = p_principal_id;

  update public.testnet_developer_credentials
  set enabled = false, revoked_at = v_now
  where id = v_old_mapping.id;

  insert into public.testnet_developer_credentials (
    principal_id,
    commercial_api_credential_id,
    label,
    integration_type,
    enabled
  ) values (
    p_principal_id,
    v_new_credential_id,
    trim(p_label),
    p_integration_type,
    true
  )
  returning id into v_new_mapping_id;

  insert into public.commercial_api_credential_lifecycle_events (
    principal_id,
    credential_id,
    previous_credential_id,
    key_id,
    event_type,
    actor_type,
    metadata
  ) values (
    p_principal_id,
    v_new_credential_id,
    p_old_credential_id,
    p_new_key_id,
    'rotated',
    'principal',
    jsonb_build_object(
      'mapping_id', v_new_mapping_id,
      'integration_type', p_integration_type,
      'scopes', to_jsonb(p_new_scopes)
    )
  );

  return jsonb_build_object(
    'ok', true,
    'credential_id', v_new_credential_id,
    'previous_credential_id', p_old_credential_id,
    'key_id', p_new_key_id,
    'expires_at', p_new_expires_at,
    'scopes', to_jsonb(p_new_scopes),
    'rotated_at', v_now
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'TESTNET_DEVELOPER_KEY_CONFLICT');
end;
$$;

revoke all on function public.issue_testnet_developer_credential(uuid,text,text,text[],timestamptz,text,text)
  from PUBLIC, anon, authenticated;
revoke all on function public.revoke_testnet_developer_credential(uuid,uuid)
  from PUBLIC, anon, authenticated;
revoke all on function public.rotate_testnet_developer_credential(uuid,uuid,text,text,text[],timestamptz,text,text)
  from PUBLIC, anon, authenticated;

grant execute on function public.issue_testnet_developer_credential(uuid,text,text,text[],timestamptz,text,text)
  to service_role;
grant execute on function public.revoke_testnet_developer_credential(uuid,uuid)
  to service_role;
grant execute on function public.rotate_testnet_developer_credential(uuid,uuid,text,text,text[],timestamptz,text,text)
  to service_role;

comment on table public.commercial_api_credential_lifecycle_events is
  'Append-only server-side evidence for API credential issuance, revocation, rotation and stale-state cleanup. Plaintext API secrets are prohibited.';
comment on function public.issue_testnet_developer_credential(uuid,text,text,text[],timestamptz,text,text) is
  'Service-role-only transactional issuance with principal locking, one-live-key enforcement and lifecycle evidence.';
comment on function public.revoke_testnet_developer_credential(uuid,uuid) is
  'Service-role-only idempotent transactional revocation of a principal-owned Testnet developer credential.';
comment on function public.rotate_testnet_developer_credential(uuid,uuid,text,text,text[],timestamptz,text,text) is
  'Service-role-only atomic Testnet developer credential rotation. Old key is revoked in the same transaction that creates the replacement.';
