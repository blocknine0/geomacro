-- Testnet-only database alignment. Historical rows remain unchanged.

alter table public.testnet_usdc_payment_claims
  drop constraint if exists testnet_usdc_claim_amount_check;

alter table public.testnet_usdc_payment_claims
  add constraint testnet_usdc_claim_amount_check
  check (amount_atomic >= 250000000 and amount_usdc >= 250)
  not valid;

comment on table public.testnet_usdc_payment_claims is
  'Testnet-only wallet activation claims. New fixed 500-credit activations require 250 Testnet USDC total and remain non-revenue.';
