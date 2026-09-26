-- =============================================================================
-- Tameion Agent Mode audit ledger
--
-- Testnet-only bounded autonomous-business workflow for the Tameion hackathon.
-- The Geomacro Risk Gate remains advisory and permanently records
-- risk_gate_execution_authorized=false. A separate customer-side business
-- policy decides whether a wallet may auto-execute, needs human approval, or
-- must block. Geomacro never stores wallet private keys or raw payment proofs.
-- =============================================================================

create table if not exists public.tameion_agent_decisions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,

  client_request_id text,
  subject jsonb not null,
  action_type text not null,
  policy_preset text not null,

  risk_object_id text not null,
  risk_score numeric(8,4) not null,
  risk_gate_decision text not null,
  risk_gate_recommended_action text not null,
  risk_gate_execution_authorized boolean not null default false,

  agent_action text not null,
  decision_reason_codes jsonb not null default '[]'::jsonb,
  status text not null,

  amount_usdc numeric(38,18) not null,
  amount_atomic numeric(78,0) not null,
  recipient_address text not null,
  approval_message text,
  approved_at timestamptz,
  approver_reference_hash text,

  tx_hash text unique,
  payer_reference_hash text,
  block_number numeric(30,0),
  confirmed_at timestamptz,

  audit_snapshot jsonb not null,

  constraint tameion_action_type_check
    check (action_type in ('treasury_payment','vendor_payment','agent_payment')),
  constraint tameion_policy_preset_check
    check (policy_preset in ('balanced','cautious','strict')),
  constraint tameion_risk_gate_decision_check
    check (risk_gate_decision in ('CONTINUE','REDUCE_LIMIT','REQUIRE_APPROVAL','PAUSE')),
  constraint tameion_risk_gate_action_check
    check (risk_gate_recommended_action in ('ALLOW','REDUCE_EXPOSURE','REQUIRE_HUMAN_APPROVAL','BLOCK')),
  constraint tameion_agent_action_check
    check (agent_action in ('AUTO_EXECUTE','REQUIRE_APPROVAL','BLOCK')),
  constraint tameion_status_check
    check (status in ('AUTO_EXECUTE_READY','AWAITING_APPROVAL','HUMAN_APPROVED','BLOCKED','EXECUTED','EXPIRED')),
  constraint tameion_risk_gate_execution_boundary_check
    check (risk_gate_execution_authorized = false),
  constraint tameion_amount_check
    check (amount_usdc > 0 and amount_atomic > 0),
  constraint tameion_recipient_check
    check (recipient_address ~ '^0x[0-9a-f]{40}$'),
  constraint tameion_approver_hash_check
    check (approver_reference_hash is null or approver_reference_hash ~ '^[0-9a-f]{64}$'),
  constraint tameion_payer_hash_check
    check (payer_reference_hash is null or payer_reference_hash ~ '^[0-9a-f]{64}$'),
  constraint tameion_tx_hash_check
    check (tx_hash is null or tx_hash ~ '^0x[0-9a-f]{64}$'),
  constraint tameion_client_request_check
    check (client_request_id is null or char_length(client_request_id) between 4 and 128)
);

create index if not exists tameion_agent_decisions_created_idx
  on public.tameion_agent_decisions (created_at desc);
create index if not exists tameion_agent_decisions_status_idx
  on public.tameion_agent_decisions (status, expires_at);
create index if not exists tameion_agent_decisions_client_request_idx
  on public.tameion_agent_decisions (client_request_id)
  where client_request_id is not null;

alter table public.tameion_agent_decisions enable row level security;

revoke all on table public.tameion_agent_decisions
  from PUBLIC, anon, authenticated;
grant select, insert, update on table public.tameion_agent_decisions
  to service_role;

comment on table public.tameion_agent_decisions is
  'Private server-side Tameion testnet decision, human-approval and Arc transaction audit ledger.';
comment on column public.tameion_agent_decisions.risk_gate_execution_authorized is
  'Must remain false. Tameion business-policy authorization is a separate customer-side layer.';
