-- =============================================================================
-- Geomacro Arc Testnet Tester Growth v1
-- Depends on commercial access + operations ledger migrations.
-- =============================================================================

alter table public.commercial_usage_events
  drop constraint if exists commercial_usage_surface_check;

alter table public.commercial_usage_events
  add constraint commercial_usage_surface_check
  check (access_surface in (
    'public_web',
    'free_api',
    'arc_testnet_tester',
    'paid_dashboard',
    'commercial_api',
    'agent_payment',
    'institutional_integration',
    'technical_proof'
  ));

create table if not exists public.arc_testnet_tester_profiles (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null unique references public.commercial_principals(id) on delete cascade,
  profile_name text not null,
  avatar_path text,

  email_hash text not null unique,
  email_verified_at timestamptz,

  wallet_address_hash text not null unique,
  wallet_chain_id text not null default '5042002',
  wallet_verified_at timestamptz,

  x_account_id_hash text not null unique,
  x_connected_at timestamptz,

  discord_account_id_hash text not null unique,
  discord_connected_at timestamptz,

  terms_version text not null,
  terms_accepted_at timestamptz not null,

  registration_status text not null default 'pending',
  quota_status text not null default 'inactive',
  quota_credits_per_30_days integer not null default 250,
  quota_period_started_at timestamptz,
  quota_period_ends_at timestamptz,

  suspended_at timestamptz,
  suspension_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint arc_tester_profile_name_check
    check (char_length(profile_name) between 2 and 64),
  constraint arc_tester_hashes_check
    check (
      email_hash ~ '^[0-9a-f]{64}$' and
      wallet_address_hash ~ '^[0-9a-f]{64}$' and
      x_account_id_hash ~ '^[0-9a-f]{64}$' and
      discord_account_id_hash ~ '^[0-9a-f]{64}$'
    ),
  constraint arc_tester_registration_status_check
    check (registration_status in ('pending','complete','suspended','revoked')),
  constraint arc_tester_quota_status_check
    check (quota_status in ('inactive','active','exhausted','suspended','revoked')),
  constraint arc_tester_quota_check
    check (quota_credits_per_30_days between 1 and 5000),
  constraint arc_tester_activation_check
    check (
      registration_status <> 'complete' or (
        email_verified_at is not null and
        wallet_verified_at is not null and
        x_connected_at is not null and
        discord_connected_at is not null
      )
    )
);

create table if not exists public.arc_testnet_wallet_challenges (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null references public.commercial_principals(id) on delete cascade,
  nonce_hash text not null unique,
  wallet_address_hash text not null,
  chain_id text not null default '5042002',
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint arc_wallet_challenge_hash_check
    check (nonce_hash ~ '^[0-9a-f]{64}$' and wallet_address_hash ~ '^[0-9a-f]{64}$'),
  constraint arc_wallet_challenge_expiry_check
    check (expires_at > issued_at)
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
  constraint commercial_share_environment_check
    check (environment in ('testnet','mainnet','fiat','sandbox','internal')),
  constraint commercial_share_surface_check
    check (surface in ('free_api','arc_testnet_tester','commercial_api','agent_payment','public_web','technical_proof')),
  constraint commercial_share_platform_check
    check (platform in ('x','linkedin','reddit','whatsapp','telegram','copy_link','download_image')),
  constraint commercial_share_slug_check
    check (share_slug ~ '^[a-z0-9][a-z0-9-]{7,95}$'),
  constraint commercial_share_hash_check
    check (card_payload_sha256 ~ '^[0-9a-f]{64}$'),
  constraint commercial_share_source_boundary_check
    check (upstream_news_source_identity_exposed = false)
);

create unique index if not exists commercial_share_slug_unique
  on public.commercial_share_events (share_slug);
create index if not exists commercial_share_principal_time_idx
  on public.commercial_share_events (principal_id, occurred_at desc);
create index if not exists commercial_share_platform_time_idx
  on public.commercial_share_events (platform, occurred_at desc);

alter table public.arc_testnet_tester_profiles enable row level security;
alter table public.arc_testnet_wallet_challenges enable row level security;
alter table public.commercial_share_events enable row level security;

revoke all on table public.arc_testnet_tester_profiles from PUBLIC, anon, authenticated;
revoke all on table public.arc_testnet_wallet_challenges from PUBLIC, anon, authenticated;
revoke all on table public.commercial_share_events from PUBLIC, anon, authenticated;

grant all on table public.arc_testnet_tester_profiles to service_role;
grant all on table public.arc_testnet_wallet_challenges to service_role;
grant all on table public.commercial_share_events to service_role;

comment on table public.arc_testnet_tester_profiles is
  'Private Arc Testnet tester registration and quota state. Stores only hashed external identities; provider tokens and raw wallet/email identities are not stored here.';
comment on table public.arc_testnet_wallet_challenges is
  'One-time nonce ledger for Arc Testnet wallet ownership verification.';
comment on table public.commercial_share_events is
  'Social sharing telemetry for Geomacro result cards. Upstream news/source identity is prohibited.';
