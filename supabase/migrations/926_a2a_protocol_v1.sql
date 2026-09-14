-- =============================================================================
-- Geomacro A2A Protocol v1.0 durable task, callback and outbound audit state.
-- Server-only. No anonymous/authenticated table access. No execution authority.
-- =============================================================================

create table if not exists public.a2a_tasks (
  id text primary key,
  principal_id uuid not null references public.commercial_principals(id) on delete cascade,
  context_id text not null,
  client_message_id text not null,
  state text not null,
  request_sha256 text not null,
  request_payload jsonb not null,
  task_payload jsonb,
  history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  canceled_at timestamptz,
  constraint a2a_tasks_id_check check (id ~ '^a2a_[A-Za-z0-9-]{16,}$'),
  constraint a2a_tasks_context_check check (char_length(context_id) between 4 and 160),
  constraint a2a_tasks_message_check check (char_length(client_message_id) between 4 and 160),
  constraint a2a_tasks_hash_check check (request_sha256 ~ '^[0-9a-f]{64}$'),
  constraint a2a_tasks_state_check check (state in (
    'TASK_STATE_SUBMITTED','TASK_STATE_WORKING','TASK_STATE_COMPLETED','TASK_STATE_FAILED',
    'TASK_STATE_CANCELED','TASK_STATE_INPUT_REQUIRED','TASK_STATE_REJECTED','TASK_STATE_AUTH_REQUIRED'
  )),
  unique (principal_id, client_message_id)
);

create index if not exists a2a_tasks_principal_created_idx
  on public.a2a_tasks (principal_id, created_at desc);
create index if not exists a2a_tasks_principal_context_idx
  on public.a2a_tasks (principal_id, context_id, created_at desc);

create table if not exists public.a2a_task_events (
  id bigint generated always as identity primary key,
  task_id text not null references public.a2a_tasks(id) on delete cascade,
  principal_id uuid not null references public.commercial_principals(id) on delete cascade,
  event_type text not null,
  state text not null,
  payload_sha256 text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint a2a_task_events_type_check check (char_length(event_type) between 3 and 64),
  constraint a2a_task_events_hash_check check (payload_sha256 is null or payload_sha256 ~ '^[0-9a-f]{64}$')
);

create index if not exists a2a_task_events_task_idx
  on public.a2a_task_events (task_id, id);

create table if not exists public.a2a_push_notification_configs (
  id text primary key,
  task_id text not null references public.a2a_tasks(id) on delete cascade,
  principal_id uuid not null references public.commercial_principals(id) on delete cascade,
  callback_url text not null,
  callback_origin text not null,
  token_hash text,
  auth_schemes text[] not null default array[]::text[],
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint a2a_push_id_check check (char_length(id) between 4 and 160),
  constraint a2a_push_url_check check (callback_url ~ '^https://'),
  constraint a2a_push_origin_check check (callback_origin ~ '^https://'),
  constraint a2a_push_token_hash_check check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists a2a_push_task_idx
  on public.a2a_push_notification_configs (principal_id, task_id, created_at);

create table if not exists public.a2a_push_delivery_events (
  id bigint generated always as identity primary key,
  task_id text not null references public.a2a_tasks(id) on delete cascade,
  principal_id uuid not null references public.commercial_principals(id) on delete cascade,
  config_id text not null references public.a2a_push_notification_configs(id) on delete cascade,
  attempt integer not null check (attempt between 1 and 10),
  status text not null check (status in ('delivered','failed')),
  http_status integer,
  latency_ms integer,
  error_class text,
  created_at timestamptz not null default now()
);

create index if not exists a2a_push_delivery_task_idx
  on public.a2a_push_delivery_events (task_id, created_at desc);

create table if not exists public.a2a_outbound_interactions (
  id uuid primary key default gen_random_uuid(),
  remote_origin text not null,
  remote_agent_name text,
  remote_card_sha256 text not null,
  local_message_id text not null,
  remote_task_id text,
  status text not null,
  response_sha256 text,
  created_at timestamptz not null default now(),
  constraint a2a_outbound_origin_check check (remote_origin ~ '^https://'),
  constraint a2a_outbound_card_hash_check check (remote_card_sha256 ~ '^[0-9a-f]{64}$'),
  constraint a2a_outbound_response_hash_check check (response_sha256 is null or response_sha256 ~ '^[0-9a-f]{64}$')
);

create index if not exists a2a_outbound_created_idx
  on public.a2a_outbound_interactions (created_at desc);

alter table public.a2a_tasks enable row level security;
alter table public.a2a_task_events enable row level security;
alter table public.a2a_push_notification_configs enable row level security;
alter table public.a2a_push_delivery_events enable row level security;
alter table public.a2a_outbound_interactions enable row level security;

revoke all on table public.a2a_tasks from PUBLIC, anon, authenticated;
revoke all on table public.a2a_task_events from PUBLIC, anon, authenticated;
revoke all on table public.a2a_push_notification_configs from PUBLIC, anon, authenticated;
revoke all on table public.a2a_push_delivery_events from PUBLIC, anon, authenticated;
revoke all on table public.a2a_outbound_interactions from PUBLIC, anon, authenticated;

grant all on table public.a2a_tasks to service_role;
grant all on table public.a2a_task_events to service_role;
grant all on table public.a2a_push_notification_configs to service_role;
grant all on table public.a2a_push_delivery_events to service_role;
grant all on table public.a2a_outbound_interactions to service_role;
grant usage, select on sequence public.a2a_task_events_id_seq to service_role;
grant usage, select on sequence public.a2a_push_delivery_events_id_seq to service_role;

comment on table public.a2a_tasks is
  'Durable A2A Protocol v1.0 task state scoped to authenticated commercial principals. Never authorizes execution.';
comment on table public.a2a_push_notification_configs is
  'A2A callback metadata only. Plaintext callback credentials are never persisted; outbound credentials are resolved from server-side per-origin configuration.';
comment on table public.a2a_outbound_interactions is
  'Audit trail for Geomacro acting as an A2A client against explicitly allowlisted remote agents.';
