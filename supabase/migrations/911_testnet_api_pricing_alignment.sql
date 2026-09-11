-- Testnet-only database alignment. Historical rows remain unchanged.

alter table public.testnet_usdc_payment_claims
  drop constraint if exists testnet_usdc_claim_amount_check;

alter table public.testnet_usdc_payment_claims
  add constraint testnet_usdc_claim_amount_check
  check (amount_atomic >= 250000000 and amount_usdc >= 250)
  not valid;

create or replace function public.align_testnet_tester_grant_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.tier = 'testnet_tester'
     and coalesce(new.metadata->>'offer_id','') = 'testnet_tester_pass_30d' then
    new.included_credits := 500;
    new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
      'quota_credits', 500,
      'credit_price_testnet_usdc', 0.5,
      'quota_price_usdc', 250,
      'fixed_quota_per_verified_wallet', true,
      'testnet_api_pricing_version', 'testnet-api-pricing-v1.0.0',
      'payment_environment', 'testnet',
      'payment_asset', 'USDC',
      'commercial_revenue', false,
      'execution_authorized', false
    );
  end if;
  return new;
end;
$$;

drop trigger if exists align_testnet_tester_grant_metadata_trigger
  on public.commercial_entitlement_grants;
create trigger align_testnet_tester_grant_metadata_trigger
before insert or update on public.commercial_entitlement_grants
for each row execute function public.align_testnet_tester_grant_metadata();

comment on table public.testnet_usdc_payment_claims is
  'Testnet-only wallet activation claims. New fixed 500-credit activations require 250 Testnet USDC total and remain non-revenue.';
