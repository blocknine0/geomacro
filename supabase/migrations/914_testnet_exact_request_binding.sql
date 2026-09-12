-- =============================================================================
-- Geomacro Testnet exact request/payment retry binding
--
-- Testnet only. This preserves historical payment evidence and adds an
-- immutable request fingerprint ledger so a request_id cannot be reused with a
-- different normalized payload before or after a Testnet USDC payment.
-- =============================================================================

create table if not exists public.testnet_api_request_bindings (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null references public.commercial_principals(id) on delete cascade,
  request_id text not null,
  capability text not null,
  request_fingerprint_sha256 text not null,
  created_at timestamptz not null default now(),
  constraint testnet_api_request_binding_request_id_check
    check (char_length(request_id) between 8 and 160),
  constraint testnet_api_request_binding_capability_check
    check (char_length(capability) between 2 and 80),
  constraint testnet_api_request_binding_hash_check
    check (request_fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
  unique (principal_id, request_id)
);

create index if not exists testnet_api_request_binding_principal_time_idx
  on public.testnet_api_request_bindings (principal_id, created_at desc);

alter table public.testnet_api_request_bindings enable row level security;
revoke all on table public.testnet_api_request_bindings from PUBLIC, anon, authenticated;
grant all on table public.testnet_api_request_bindings to service_role;

comment on table public.testnet_api_request_bindings is
  'Immutable Testnet pay-per-call request binding. One principal/request_id maps to one canonical request payload hash so retries can reuse the same transaction proof but payload changes fail closed.';
comment on column public.testnet_api_request_bindings.request_fingerprint_sha256 is
  'SHA-256 of the canonical parsed Testnet intelligence request excluding payment proof. Policy/action defaults are included after schema parsing.';
