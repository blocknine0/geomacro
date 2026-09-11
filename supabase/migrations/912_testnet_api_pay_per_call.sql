-- Geomacro Testnet Developer API pay-per-call alignment.
-- Testnet only. Historical settlement rows remain unchanged.

alter table public.testnet_tester_profiles
  drop constraint if exists testnet_tester_activation_check;

alter table public.testnet_tester_profiles
  add constraint testnet_tester_activation_check
  check (
    access_status <> 'active' or (
      registration_status = 'complete' and
      wallet_verified_at is not null and
      current_entitlement_grant_id is not null
    )
  );

alter table public.testnet_usdc_payment_claims
  drop constraint if exists testnet_usdc_claim_amount_check;

alter table public.testnet_usdc_payment_claims
  add constraint testnet_usdc_claim_amount_check
  check (amount_atomic >= 500000 and amount_usdc >= 0.5)
  not valid;

alter table public.testnet_usdc_payment_claims
  add column if not exists request_id text,
  add column if not exists capability text,
  add column if not exists credit_cost integer,
  add column if not exists required_amount_atomic numeric(78,0),
  add column if not exists pricing_version text;

create unique index if not exists testnet_usdc_payment_claim_principal_request_unique
  on public.testnet_usdc_payment_claims (principal_id, request_id)
  where request_id is not null;
