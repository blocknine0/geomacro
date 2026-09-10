-- =============================================================================
-- Geomacro Commercial Access Platform v1: principals, API credentials, grants
--
-- Provider-agnostic identity/entitlement foundation for Free, Analyst, API and
-- Institutional access. This does not activate production billing by itself.
-- =============================================================================

create table if not exists public.commercial_principals (
  id uuid primary key default gen_random_uuid(),
  principal_type text not null,
  external_id text not null,
  display_name text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint commercial_principals_type_check
    check (principal_type in ('wallet', 'email', 'organization', 'api_client', 'agent', 'internal')),
  constraint commercial_principals_external_id_check
    check (char_length(external_id) between 3 and 256),
  constraint commercial_principals_status_check
    check (status in ('active', 'suspended', 'closed')),
  unique (principal_type, external_id)
);

create table if not exists public.commercial_api_credentials (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null references public.commercial_principals(id) on delete cascade,
  key_id text not null unique,
  api_key_hash text not null unique,
  enabled boolean not null default true,
  scopes text[] not null default array[]::text[],
  expires_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,

  constraint commercial_api_credentials_key_id_check
    check (char_length(key_id) between 8 and 96),
  constraint commercial_api_credentials_hash_check
    check (api_key_hash ~ '^[0-9a-f]{64}$'),
  constraint commercial_api_credentials_expiry_check
    check (expires_at is null or expires_at > created_at)
);

create index if not exists commercial_api_credentials_principal_idx
  on public.commercial_api_credentials (principal_id, enabled);

create table if not exists public.commercial_entitlement_grants (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null references public.commercial_principals(id) on delete cascade,
  tier text not null,
  included_credits integer not null,
  contract_version text not null,
  source_type text not null,
  source_reference text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,

  constraint commercial_entitlement_grants_tier_check
    check (tier in ('free', 'analyst_pilot', 'api_pilot', 'institutional')),
  constraint commercial_entitlement_grants_credits_check
    check (included_credits >= 0),
  constraint commercial_entitlement_grants_contract_check
    check (char_length(contract_version) between 3 and 64),
  constraint commercial_entitlement_grants_source_check
    check (source_type in ('free_provisioning', 'manual_pilot', 'subscription', 'invoice', 'payment_provider', 'goat_x402', 'internal')),
  constraint commercial_entitlement_grants_period_check
    check (ends_at > starts_at),
  constraint commercial_entitlement_grants_status_check
    check (status in ('active', 'expired', 'revoked', 'suspended'))
);

create index if not exists commercial_entitlement_grants_active_idx
  on public.commercial_entitlement_grants (principal_id, status, starts_at, ends_at);

-- Server-only lookup used by the commercial API authentication layer. Raw keys
-- are never persisted. Only a SHA-256 hash is accepted.
create or replace function public.resolve_commercial_api_principal(
  p_api_key_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credential public.commercial_api_credentials%rowtype;
  v_principal public.commercial_principals%rowtype;
begin
  if p_api_key_hash is null or p_api_key_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_API_KEY_HASH');
  end if;

  select * into v_credential
  from public.commercial_api_credentials
  where api_key_hash = p_api_key_hash
  for update;

  if not found
    or v_credential.enabled is not true
    or v_credential.revoked_at is not null
    or (v_credential.expires_at is not null and v_credential.expires_at <= now())
  then
    return jsonb_build_object('ok', false, 'code', 'API_KEY_NOT_AUTHORIZED');
  end if;

  select * into v_principal
  from public.commercial_principals
  where id = v_credential.principal_id;

  if not found or v_principal.status <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'PRINCIPAL_NOT_ACTIVE');
  end if;

  update public.commercial_api_credentials
  set last_used_at = now()
  where id = v_credential.id;

  return jsonb_build_object(
    'ok', true,
    'principal_id', v_principal.id,
    'principal_type', v_principal.principal_type,
    'principal_external_id', v_principal.external_id,
    'key_id', v_credential.key_id,
    'scopes', to_jsonb(v_credential.scopes)
  );
end;
$$;

alter table public.commercial_principals enable row level security;
alter table public.commercial_api_credentials enable row level security;
alter table public.commercial_entitlement_grants enable row level security;

revoke all on table public.commercial_principals from PUBLIC, anon, authenticated;
revoke all on table public.commercial_api_credentials from PUBLIC, anon, authenticated;
revoke all on table public.commercial_entitlement_grants from PUBLIC, anon, authenticated;

grant all on table public.commercial_principals to service_role;
grant all on table public.commercial_api_credentials to service_role;
grant all on table public.commercial_entitlement_grants to service_role;

revoke all on function public.resolve_commercial_api_principal(text)
  from PUBLIC, anon, authenticated;
grant execute on function public.resolve_commercial_api_principal(text)
  to service_role;

comment on table public.commercial_principals is
  'Provider-agnostic commercial identities. external_id is a canonical non-secret identifier.';
comment on table public.commercial_api_credentials is
  'Server-only hashed commercial API credentials. Plaintext API keys must never be persisted.';
comment on table public.commercial_entitlement_grants is
  'Durable entitlement provenance linking a commercial tier to free provisioning, contract, invoice or verified provider payment.';
