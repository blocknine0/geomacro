-- =============================================================================
-- API credential digest hardening
--
-- New application code stores keyed HMAC-SHA-256 credential digests. Existing
-- SHA-256 lookup digests cannot be transformed without the original credential,
-- so this server-only bridge upgrades a legacy row atomically on first valid use.
-- The bridge expires after a finite migration window; after that, unused legacy
-- credentials must be rotated instead of keeping a weak verifier indefinitely.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

create or replace function public.upgrade_commercial_api_credential_hash(
  p_key_id text,
  p_presented_credential text,
  p_hmac_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_legacy_hash text;
  v_credential public.commercial_api_credentials%rowtype;
begin
  if now() > timestamptz '2026-10-31 23:59:59+00' then
    return jsonb_build_object('upgraded', false, 'code', 'LEGACY_CREDENTIAL_MIGRATION_CLOSED');
  end if;

  if p_presented_credential is null
    or char_length(p_presented_credential) < 24
    or char_length(p_presented_credential) > 512
    or p_hmac_hash is null
    or p_hmac_hash !~ '^[0-9a-f]{64}$'
  then
    return jsonb_build_object('upgraded', false, 'code', 'INVALID_CREDENTIAL_INPUT');
  end if;

  v_legacy_hash := encode(digest(convert_to(p_presented_credential, 'UTF8'), 'sha256'), 'hex');

  select * into v_credential
  from public.commercial_api_credentials
  where api_key_hash = v_legacy_hash
    and (p_key_id is null or key_id = p_key_id)
  for update;

  if not found then
    return jsonb_build_object('upgraded', false, 'code', 'LEGACY_CREDENTIAL_NOT_FOUND');
  end if;

  if v_credential.enabled is not true
    or v_credential.revoked_at is not null
    or (v_credential.expires_at is not null and v_credential.expires_at <= now())
  then
    return jsonb_build_object('upgraded', false, 'code', 'LEGACY_CREDENTIAL_NOT_ACTIVE');
  end if;

  update public.commercial_api_credentials
  set api_key_hash = p_hmac_hash
  where id = v_credential.id;

  return jsonb_build_object(
    'upgraded', true,
    'credential_id', v_credential.id,
    'key_id', v_credential.key_id
  );
exception
  when unique_violation then
    return jsonb_build_object('upgraded', false, 'code', 'HMAC_DIGEST_CONFLICT');
end;
$$;

create or replace function public.upgrade_risk_gate_api_client_hash(
  p_presented_credential text,
  p_hmac_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_legacy_hash text;
  v_client public.risk_gate_api_clients%rowtype;
begin
  if now() > timestamptz '2026-10-31 23:59:59+00' then
    return jsonb_build_object('upgraded', false, 'code', 'LEGACY_CREDENTIAL_MIGRATION_CLOSED');
  end if;

  if p_presented_credential is null
    or char_length(p_presented_credential) < 32
    or char_length(p_presented_credential) > 512
    or p_hmac_hash is null
    or p_hmac_hash !~ '^[0-9a-f]{64}$'
  then
    return jsonb_build_object('upgraded', false, 'code', 'INVALID_CREDENTIAL_INPUT');
  end if;

  v_legacy_hash := encode(digest(convert_to(p_presented_credential, 'UTF8'), 'sha256'), 'hex');

  select * into v_client
  from public.risk_gate_api_clients
  where api_key_hash = v_legacy_hash
  for update;

  if not found then
    return jsonb_build_object('upgraded', false, 'code', 'LEGACY_CREDENTIAL_NOT_FOUND');
  end if;

  if v_client.enabled is not true or v_client.disabled_at is not null then
    return jsonb_build_object('upgraded', false, 'code', 'LEGACY_CREDENTIAL_NOT_ACTIVE');
  end if;

  update public.risk_gate_api_clients
  set api_key_hash = p_hmac_hash
  where id = v_client.id;

  return jsonb_build_object(
    'upgraded', true,
    'client_id', v_client.client_id
  );
exception
  when unique_violation then
    return jsonb_build_object('upgraded', false, 'code', 'HMAC_DIGEST_CONFLICT');
end;
$$;

revoke all on function public.upgrade_commercial_api_credential_hash(text, text, text)
  from PUBLIC, anon, authenticated;
grant execute on function public.upgrade_commercial_api_credential_hash(text, text, text)
  to service_role;

revoke all on function public.upgrade_risk_gate_api_client_hash(text, text)
  from PUBLIC, anon, authenticated;
grant execute on function public.upgrade_risk_gate_api_client_hash(text, text)
  to service_role;

comment on function public.upgrade_commercial_api_credential_hash(text, text, text) is
  'Service-role-only finite bridge that upgrades one valid legacy SHA-256 API credential verifier to the application HMAC digest on first use.';
comment on function public.upgrade_risk_gate_api_client_hash(text, text) is
  'Service-role-only finite bridge that upgrades one valid legacy Risk Gate API verifier to the application HMAC digest on first use.';
