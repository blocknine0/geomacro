-- =============================================================================
-- Geomacro paid multichain Testnet USDC tester access v1
-- Depends on 900/901 commercial access and 902 commercial operations ledger.
-- =============================================================================

alter table public.commercial_entitlement_grants
  drop constraint if exists commercial_entitlement_grants_tier_check;

alter table public.commercial_entitlement_grants
  add constraint commercial_entitlement_grants_tier_check
  check (tier in ('free','testnet_tester','analyst_pilot','api_pilot','institutional'));

alter table public.commercial_entitlement_grants
  drop constraint if exists commercial_entitlement_grants_source_check;

alter table public.commercial_entitlement_grants
  add constraint commercial_entitlement_grants_source_check
  check (source_type in (
    'free_provisioning',
    'manual_pilot',
    'subscription',
    'invoice',
    'payment_provider',
    'testnet_usdc',
    'goat_x402',
    'internal'
  ));

alter table public.commercial_usage_events
  drop constraint if exists commercial_usage_surface_check;

alter table public.commercial_usage_events
  add constraint commercial_usage_surface_check
  check (access_surface in (
    'public_web',
    'testnet_tester',
    'paid_dashboard',
    'commercial_api',
    'agent_payment',
    'institutional_integration',
    'technical_proof'
  ));

create table if not exists public.testnet_tester_profiles (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null unique references public.commercial_principals(id) on delete cascade,
  profile_name text not null,
  avatar_path text,
  email_hash text not null unique,
  email_verified_at timestamptz,
  wallet_address_hash text not null unique,
  wallet_verified_at timestamptz,
  x_account_id_hash text not null unique,
  x_connected_at timestamptz,
  discord_account_id_hash text not null unique,
  discord_connected_at timestamptz,
  terms_version text not null,
  terms_accepted_at timestamptz not null,
  registration_status text not null default 'pending',
  access_status text not null default 'awaiting_payment',
  current_payment_event_id uuid references public.commercial_payment_events(id) on delete set null,
  current_entitlement_grant_id uuid references public.commercial_entitlement_grants(id) on delete set null,
  suspended_at timestamptz,
  suspension_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint testnet_tester_profile_name_check check (char_length(profile_name) between 2 and 64),
  constraint testnet_tester_hashes_check check (
    email_hash ~ '^[0-9a-f]{64}$' and
    wallet_address_hash ~ '^[0-9a-f]{64}$' and
    x_account_id_hash ~ '^[0-9a-f]{64}$' and
    discord_account_id_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint testnet_tester_registration_status_check
    check (registration_status in ('pending','complete','suspended','revoked')),
  constraint testnet_tester_access_status_check
    check (access_status in ('awaiting_payment','active','expired','suspended','revoked')),
  constraint testnet_tester_activation_check
    check (
      access_status <> 'active' or (
        registration_status = 'complete' and
        email_verified_at is not null and
        wallet_verified_at is not null and
        x_connected_at is not null and
        discord_connected_at is not null and
        current_payment_event_id is not null and
        current_entitlement_grant_id is not null
      )
    )
);

create table if not exists public.testnet_wallet_challenges (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null references public.commercial_principals(id) on delete cascade,
  nonce_hash text not null unique,
  wallet_address_hash text not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint testnet_wallet_challenge_hash_check
    check (nonce_hash ~ '^[0-9a-f]{64}$' and wallet_address_hash ~ '^[0-9a-f]{64}$'),
  constraint testnet_wallet_challenge_expiry_check check (expires_at > issued_at)
);

create table if not exists public.testnet_usdc_payment_claims (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null references public.commercial_principals(id) on delete cascade,
  chain_id text not null,
  network_name text not null,
  usdc_contract text not null,
  tx_hash text not null,
  payer_address_hash text not null,
  recipient_address_hash text not null,
  amount_atomic numeric(78,0) not null,
  amount_usdc numeric(38,18) not null,
  verification_status text not null default 'pending',
  payment_event_id uuid references public.commercial_payment_events(id) on delete set null,
  verified_at timestamptz,
  rejected_at timestamptz,
  rejection_code text,
  created_at timestamptz not null default now(),
  constraint testnet_usdc_claim_hashes_check check (
    payer_address_hash ~ '^[0-9a-f]{64}$' and recipient_address_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint testnet_usdc_claim_tx_check check (tx_hash ~ '^0x[0-9a-fA-F]{64}$'),
  constraint testnet_usdc_claim_amount_check check (amount_atomic >= 1000000 and amount_usdc >= 1),
  constraint testnet_usdc_claim_status_check
    check (verification_status in ('pending','verified','rejected')),
  unique (chain_id, tx_hash)
);

create table if not exists public.testnet_developer_credentials (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null references public.commercial_principals(id) on delete cascade,
  commercial_api_credential_id uuid not null unique references public.commercial_api_credentials(id) on delete cascade,
  label text not null default 'Default test integration',
  integration_type text not null default 'product_api',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint testnet_developer_credentials_label_check check (char_length(label) between 2 and 80),
  constraint testnet_developer_credentials_type_check
    check (integration_type in ('product_api','ai_agent','automation','demo'))
);

create table if not exists public.commercial_share_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  principal_id uuid references public.commercial_principals(id) on delete set null,
  usage_event_id uuid references public.commercial_usage_events(id) on delete set null,
  environment text not null,
  surface text not null,
  platform text not null,
  share_slug text not null,
  card_version text not null default 'geomacro-social-card-v1',
  card_payload_sha256 text not null,
  subject_type text,
  subject_key text,
  risk_object_id text,
  profile_name_displayed boolean not null default false,
  upstream_news_source_identity_exposed boolean not null default false,
  created_at timestamptz not null default now(),
  constraint commercial_share_environment_check check (environment in ('testnet','mainnet','fiat','sandbox','internal')),
  constraint commercial_share_surface_check check (surface in ('testnet_tester','commercial_api','agent_payment','public_web','technical_proof')),
  constraint commercial_share_platform_check check (platform in ('x','linkedin','reddit','whatsapp','telegram','copy_link','download_image')),
  constraint commercial_share_slug_check check (share_slug ~ '^[a-z0-9][a-z0-9-]{7,95}$'),
  constraint commercial_share_hash_check check (card_payload_sha256 ~ '^[0-9a-f]{64}$'),
  constraint commercial_share_source_boundary_check check (upstream_news_source_identity_exposed = false)
);

create unique index if not exists commercial_share_slug_unique on public.commercial_share_events (share_slug);
create index if not exists commercial_share_principal_time_idx on public.commercial_share_events (principal_id, occurred_at desc);
create index if not exists testnet_payment_claim_principal_idx on public.testnet_usdc_payment_claims (principal_id, created_at desc);
create index if not exists testnet_developer_credentials_principal_idx on public.testnet_developer_credentials (principal_id, enabled, created_at desc);

alter table public.testnet_tester_profiles enable row level security;
alter table public.testnet_wallet_challenges enable row level security;
alter table public.testnet_usdc_payment_claims enable row level security;
alter table public.testnet_developer_credentials enable row level security;
alter table public.commercial_share_events enable row level security;

revoke all on table public.testnet_tester_profiles from PUBLIC, anon, authenticated;
revoke all on table public.testnet_wallet_challenges from PUBLIC, anon, authenticated;
revoke all on table public.testnet_usdc_payment_claims from PUBLIC, anon, authenticated;
revoke all on table public.testnet_developer_credentials from PUBLIC, anon, authenticated;
revoke all on table public.commercial_share_events from PUBLIC, anon, authenticated;

grant all on table public.testnet_tester_profiles to service_role;
grant all on table public.testnet_wallet_challenges to service_role;
grant all on table public.testnet_usdc_payment_claims to service_role;
grant all on table public.testnet_developer_credentials to service_role;
grant all on table public.commercial_share_events to service_role;

comment on table public.testnet_tester_profiles is
  'Private verified tester registration state. Access activates only after a verified supported-testnet USDC payment creates a canonical testnet_tester entitlement.';
comment on table public.testnet_usdc_payment_claims is
  'Replay-protected claims for 1 USDC Testnet Tester Pass purchases. Testnet settlement is non-revenue.';
comment on table public.testnet_developer_credentials is
  'Private mapping for paid testnet users who integrate Geomacro into their own product, AI agent, automation or demo. Plaintext API keys remain outside the database and are returned only at creation time.';
comment on table public.commercial_share_events is
  'Social sharing telemetry. Upstream news/publisher/source identity is prohibited from customer-facing share cards.';
