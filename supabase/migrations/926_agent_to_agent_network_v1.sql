-- =============================================================================
-- Geomacro Agent-to-Agent Network v1
--
-- Durable identities, signed-request replay protection, task lifecycle and
-- audit trail for machine-to-machine Risk Gate access. Service-role only.
-- This migration does not authorize execution of financial transactions.
-- =============================================================================

create table if not exists public.a2a_agent_identities (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null references public.commercial_principals(id) on delete cascade,
  agent_id text not null unique,
  protocol_version text not null default 'geomacro-a2a/1',
  public_key_jwk jsonb not null,
  public_key_fingerprint text not null,
  callback_origins text[] not null default array[]::text[],
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,

  constraint a2a_agent_identities_agent_id_check
    check (agent_id ~ '^[a-z0-9][a-z0-9._:-]{2,63}$'),
  constraint a2a_agent_identities_protocol_check
    check (protocol_version = 'geomacro-a2a/1'),
  constraint a2a_agent_identities_fingerprint_check
    check (public_key_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint a2a_agent_identities_status_check
    check (status in ('active', 'suspended', 'revoked')),
  unique (principal_id, agent_id)
);

create index if not exists a2a_agent_identities_principal_idx
  on public.a2a_agent_identities (principal_id, status);

create table if not exists public.a2a_request_nonces (
  id uuid primary key default gen_random_uuid(),
  agent_identity_id uuid not null references public.a2a_agent_identities(id) on delete cascade,
  nonce text not null,
  used_at timestamptz not null default now(),
  expires_at timestamptz not null,

  constraint a2a_request_nonces_nonce_check
    check (char_length(nonce) between 16 and 160),
  constraint a2a_request_nonces_expiry_check
    check (expires_at > used_at),
  unique (agent_identity_id, nonce)
);

create index if not exists a2a_request_nonces_expiry_idx
  on public.a2a_request_nonces (expires_at);

create table if not exists public.a2a_tasks (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null references public.commercial_principals(id) on delete cascade,
  agent_identity_id uuid not null references public.a2a_agent_identities(id) on delete cascade,
  client_task_id text not null,
  protocol_version text not null default 'geomacro-a2a/1',
  capability text not null,
  payment_mode text not null,
  status text not null default 'accepted',
  request_hash text not null,
  request_json jsonb not null,
  result_json jsonb,
  result_hash text,
  error_json jsonb,
  payment_reference text,
  payment_json jsonb,
  callback_url text,
  callback_status text not null default 'not_requested',
  callback_attempt_count integer not null default 0,
  callback_last_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,

  constraint a2a_tasks_client_task_id_check
    check (char_length(client_task_id) between 8 and 160),
  constraint a2a_tasks_protocol_check
    check (protocol_version = 'geomacro-a2a/1'),
  constraint a2a_tasks_capability_check
    check (capability = 'risk_preflight'),
  constraint a2a_tasks_payment_mode_check
    check (payment_mode in ('commercial_credit', 'x402_testnet')),
  constraint a2a_tasks_status_check
    check (status in ('accepted', 'payment_required', 'processing', 'completed', 'failed')),
  constraint a2a_tasks_request_hash_check
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint a2a_tasks_result_hash_check
    check (result_hash is null or result_hash ~ '^[0-9a-f]{64}$'),
  constraint a2a_tasks_callback_status_check
    check (callback_status in ('not_requested', 'pending', 'delivered', 'failed', 'blocked')),
  constraint a2a_tasks_callback_attempt_check
    check (callback_attempt_count >= 0),
  unique (principal_id, client_task_id)
);

create index if not exists a2a_tasks_identity_created_idx
  on public.a2a_tasks (agent_identity_id, created_at desc);
create index if not exists a2a_tasks_status_created_idx
  on public.a2a_tasks (status, created_at desc);

create table if not exists public.a2a_audit_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.a2a_tasks(id) on delete cascade,
  principal_id uuid references public.commercial_principals(id) on delete cascade,
  agent_identity_id uuid references public.a2a_agent_identities(id) on delete cascade,
  event_type text not null,
  payload_hash text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint a2a_audit_events_type_check
    check (char_length(event_type) between 3 and 80),
  constraint a2a_audit_events_hash_check
    check (payload_hash is null or payload_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists a2a_audit_events_task_idx
  on public.a2a_audit_events (task_id, created_at asc);
create index if not exists a2a_audit_events_principal_idx
  on public.a2a_audit_events (principal_id, created_at desc);

alter table public.a2a_agent_identities enable row level security;
alter table public.a2a_request_nonces enable row level security;
alter table public.a2a_tasks enable row level security;
alter table public.a2a_audit_events enable row level security;

revoke all on table public.a2a_agent_identities from anon, authenticated;
revoke all on table public.a2a_request_nonces from anon, authenticated;
revoke all on table public.a2a_tasks from anon, authenticated;
revoke all on table public.a2a_audit_events from anon, authenticated;

comment on table public.a2a_agent_identities is
  'Commercial-principal-bound Ed25519 identities for Geomacro A2A signed requests.';
comment on table public.a2a_request_nonces is
  'Short-lived one-time nonces preventing replay of signed A2A requests.';
comment on table public.a2a_tasks is
  'Durable A2A risk-preflight task lifecycle with idempotent client task IDs.';
comment on table public.a2a_audit_events is
  'Append-only style A2A protocol audit trail. No API secrets or private keys are stored.';
