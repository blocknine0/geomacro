-- =============================================================================
-- Geomacro Testnet public share pages v1
-- Canonical, sanitized payload for shareable Testnet intelligence results.
-- Depends on 902 commercial usage ledger and 904 share-event telemetry.
-- =============================================================================

create table if not exists public.testnet_public_share_pages (
  id uuid primary key default gen_random_uuid(),
  share_slug text not null unique,
  principal_id uuid not null references public.commercial_principals(id) on delete cascade,
  usage_event_id uuid not null references public.commercial_usage_events(id) on delete cascade,
  card_version text not null default 'geomacro-testnet-card-v1',
  payload_sha256 text not null,
  subject text not null,
  summary text not null,
  risk_score numeric(6,2),
  risk_delta numeric(7,2),
  confidence numeric(6,2),
  chain_label text not null default 'Multichain Testnet',
  profile_name text,
  risk_object_id text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint testnet_public_share_slug_check check (share_slug ~ '^[a-z0-9][a-z0-9-]{7,95}$'),
  constraint testnet_public_share_hash_check check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  constraint testnet_public_share_subject_check check (char_length(subject) between 1 and 72),
  constraint testnet_public_share_summary_check check (char_length(summary) between 1 and 220),
  constraint testnet_public_share_score_check check (risk_score is null or (risk_score >= 0 and risk_score <= 100)),
  constraint testnet_public_share_delta_check check (risk_delta is null or (risk_delta >= -100 and risk_delta <= 100)),
  constraint testnet_public_share_confidence_check check (confidence is null or (confidence >= 0 and confidence <= 100)),
  constraint testnet_public_share_chain_check check (char_length(chain_label) between 2 and 32),
  constraint testnet_public_share_profile_check check (profile_name is null or char_length(profile_name) between 2 and 48)
);

create index if not exists testnet_public_share_principal_time_idx
  on public.testnet_public_share_pages (principal_id, created_at desc);
create index if not exists testnet_public_share_usage_idx
  on public.testnet_public_share_pages (usage_event_id);

alter table public.testnet_public_share_pages enable row level security;
revoke all on table public.testnet_public_share_pages from PUBLIC, anon, authenticated;
grant all on table public.testnet_public_share_pages to service_role;

comment on table public.testnet_public_share_pages is
  'Public-card payload restricted to sanitized Geomacro Testnet output. No upstream news publisher/source identity, raw evidence, wallet address, email, X ID, Discord ID, OAuth token, API key or private warehouse payload is permitted.';
