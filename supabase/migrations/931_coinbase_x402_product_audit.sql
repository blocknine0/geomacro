-- Immutable-ish product audit projection for adaptive x402 delivery.
-- No raw payment signatures, private keys, API credentials, or wallet addresses.

create table if not exists public.coinbase_x402_product_audit (
  request_id uuid primary key,
  client_request_id text,
  payment_fingerprint_sha256 text not null unique,
  query_plan_hash text not null,
  product_id text not null,
  delivered_product_hash text,
  environment text not null,
  network text not null,
  asset text not null,
  amount_atomic numeric(78,0) not null,
  settlement_tx text,
  status text not null,
  reconciliation_status text not null default 'not_started',
  prepared_at timestamptz,
  settled_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coinbase_x402_audit_payment_hash_check check (payment_fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
  constraint coinbase_x402_audit_plan_hash_check check (query_plan_hash ~ '^[0-9a-f]{64}$'),
  constraint coinbase_x402_audit_product_hash_check check (delivered_product_hash is null or delivered_product_hash ~ '^[0-9a-f]{64}$'),
  constraint coinbase_x402_audit_environment_check check (environment in ('testnet','mainnet')),
  constraint coinbase_x402_audit_status_check check (status in ('prepared','settled','delivered','manual_review','failed')),
  constraint coinbase_x402_audit_tx_check check (settlement_tx is null or settlement_tx ~ '^0x[a-fA-F0-9]{64}$')
);

create index if not exists coinbase_x402_product_audit_plan_idx
  on public.coinbase_x402_product_audit (query_plan_hash, created_at desc);
create index if not exists coinbase_x402_product_audit_status_idx
  on public.coinbase_x402_product_audit (status, reconciliation_status, updated_at desc);

alter table public.coinbase_x402_product_audit enable row level security;
revoke all on table public.coinbase_x402_product_audit from PUBLIC, anon, authenticated;
grant all on table public.coinbase_x402_product_audit to service_role;

comment on table public.coinbase_x402_product_audit is
  'Private x402 commercial audit trail binding request ID, query plan, price, settlement tx and delivered product hash without storing raw payment authorization or wallet secrets.';
