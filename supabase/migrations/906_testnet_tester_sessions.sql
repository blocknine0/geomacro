-- =============================================================================
-- Geomacro Testnet Tester account/session runtime v1
-- Depends on 904 tester profiles and 905 payment activation.
-- =============================================================================

create table if not exists public.testnet_tester_sessions (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null references public.commercial_principals(id) on delete cascade,
  session_token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  constraint testnet_tester_session_hash_check check (session_token_hash ~ '^[0-9a-f]{64}$'),
  constraint testnet_tester_session_expiry_check check (expires_at > created_at)
);

create table if not exists public.testnet_email_verification_challenges (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null references public.commercial_principals(id) on delete cascade,
  email_hash text not null,
  token_hash text not null unique,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint testnet_email_verification_hash_check check (
    email_hash ~ '^[0-9a-f]{64}$' and token_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint testnet_email_verification_expiry_check check (expires_at > issued_at)
);

create table if not exists public.testnet_oauth_states (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null references public.commercial_principals(id) on delete cascade,
  provider text not null,
  state_hash text not null unique,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint testnet_oauth_provider_check check (provider in ('x','discord')),
  constraint testnet_oauth_state_hash_check check (state_hash ~ '^[0-9a-f]{64}$'),
  constraint testnet_oauth_state_expiry_check check (expires_at > issued_at)
);

create index if not exists testnet_tester_sessions_principal_idx
  on public.testnet_tester_sessions (principal_id, expires_at desc);
create index if not exists testnet_email_challenges_principal_idx
  on public.testnet_email_verification_challenges (principal_id, issued_at desc);
create index if not exists testnet_oauth_states_principal_idx
  on public.testnet_oauth_states (principal_id, provider, issued_at desc);

alter table public.testnet_tester_sessions enable row level security;
alter table public.testnet_email_verification_challenges enable row level security;
alter table public.testnet_oauth_states enable row level security;

revoke all on table public.testnet_tester_sessions from PUBLIC, anon, authenticated;
revoke all on table public.testnet_email_verification_challenges from PUBLIC, anon, authenticated;
revoke all on table public.testnet_oauth_states from PUBLIC, anon, authenticated;

grant all on table public.testnet_tester_sessions to service_role;
grant all on table public.testnet_email_verification_challenges to service_role;
grant all on table public.testnet_oauth_states to service_role;

comment on table public.testnet_tester_sessions is
  'Opaque private tester sessions. Only SHA-256 session-token hashes are persisted; plaintext tokens are returned once to the client.';
comment on table public.testnet_email_verification_challenges is
  'Single-use email verification challenges. Raw email and raw verification token are never stored.';
comment on table public.testnet_oauth_states is
  'Single-use X/Discord OAuth CSRF state. OAuth access/refresh tokens are intentionally not stored in these tables.';
