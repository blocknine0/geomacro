-- =============================================================================
-- Geomacro Testnet pay-per-call runtime hardening
--
-- Testnet only. This migration does not change mainnet/commercial pricing and
-- does not rewrite historical Testnet settlement records.
-- =============================================================================

-- Supersede the v1.0 fixed-pass grant trigger from migration 911. Keep exactly
-- one canonical trigger and actively remove legacy fixed-quota metadata keys.
create or replace function public.align_testnet_tester_grant_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.tier = 'testnet_tester' then
    new.included_credits := 500;
    new.metadata := (
      coalesce(new.metadata, '{}'::jsonb)
      - 'quota_price_usdc'
      - 'quota_credits'
      - 'fixed_quota_per_verified_wallet'
      - 'fixed_quota_per_verified_email_and_wallet'
    ) || jsonb_build_object(
      'offer_id', 'testnet_tester_metered_30d',
      'entitlement_kind', 'testnet_metered_access',
      'structured_data_registry_version', 'structured-entitlements-v1.1.0',
      'max_credits_per_30_days', 500,
      'credit_price_testnet_usdc', 0.5,
      'payment_model', 'pay_per_call',
      'upfront_payment_required', false,
      'testnet_api_pricing_version', 'testnet-api-pricing-v1.1.0',
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
drop trigger if exists trg_align_testnet_tester_grant_metadata
  on public.commercial_entitlement_grants;

create trigger trg_align_testnet_tester_grant_metadata
before insert or update on public.commercial_entitlement_grants
for each row
execute function public.align_testnet_tester_grant_metadata();

-- Reconcile any currently active Testnet grant without changing its historical
-- identity or validity window. The BEFORE trigger rewrites metadata only.
update public.commercial_entitlement_grants
set included_credits = included_credits
where tier = 'testnet_tester' and status = 'active';

-- Supersede migration 911's fixed-250 payment metadata trigger. Every new
-- Testnet tester payment is one metered API-call settlement and is non-revenue.
create or replace function public.align_testnet_tester_payment_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.environment = 'testnet' and new.tier = 'testnet_tester' then
    new.commercial_revenue := false;
    new.revenue_classification := 'testnet_non_revenue';
    new.metadata := (
      coalesce(new.metadata, '{}'::jsonb)
      - 'quota_price_usdc'
      - 'quota_credits'
      - 'fixed_quota_per_verified_wallet'
      - 'fixed_quota_per_verified_email_and_wallet'
    ) || jsonb_build_object(
      'testnet_only', true,
      'max_credits_per_30_days', 500,
      'credit_price_testnet_usdc', 0.5,
      'payment_model', 'pay_per_call',
      'upfront_payment_required', false,
      'testnet_api_pricing_version', 'testnet-api-pricing-v1.1.0',
      'commercial_revenue', false,
      'execution_authorized', false
    );
  end if;
  return new;
end;
$$;

drop trigger if exists align_testnet_tester_payment_metadata_trigger
  on public.commercial_payment_events;
drop trigger if exists trg_align_testnet_tester_payment_metadata
  on public.commercial_payment_events;

create trigger trg_align_testnet_tester_payment_metadata
before insert or update on public.commercial_payment_events
for each row
execute function public.align_testnet_tester_payment_metadata();

-- New pay-per-call claims carry enough information to reconcile one payment to
-- one request/capability. Historical activation claims may keep these fields
-- null and remain immutable historical evidence.
alter table public.testnet_usdc_payment_claims
  drop constraint if exists testnet_usdc_pay_per_call_shape_check;

alter table public.testnet_usdc_payment_claims
  add constraint testnet_usdc_pay_per_call_shape_check
  check (
    request_id is null or (
      char_length(request_id) between 8 and 160 and
      capability is not null and
      char_length(capability) between 2 and 80 and
      credit_cost is not null and
      credit_cost > 0 and
      required_amount_atomic is not null and
      required_amount_atomic >= 500000 and
      pricing_version is not null and
      char_length(pricing_version) between 3 and 80
    )
  )
  not valid;

-- The old fixed-pass activation function is historical only. Keep the exact
-- signature so stale callers fail deterministically instead of reviving an
-- upfront-payment path.
create or replace function public.activate_verified_testnet_usdc_pass(
  p_principal_id uuid,
  p_chain_id text,
  p_network_name text,
  p_usdc_contract text,
  p_tx_hash text,
  p_payer_address_hash text,
  p_recipient_address_hash text,
  p_amount_atomic numeric,
  p_amount_usdc numeric,
  p_block_number numeric,
  p_registry_version text,
  p_contract_version text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'TESTNET_UPFRONT_ACTIVATION_RETIRED';
end;
$$;

revoke all on function public.activate_verified_testnet_usdc_pass(
  uuid, text, text, text, text, text, text, numeric, numeric, numeric, text, text
) from PUBLIC, anon, authenticated, service_role;

comment on function public.activate_verified_testnet_usdc_pass(
  uuid, text, text, text, text, text, text, numeric, numeric, numeric, text, text
) is
  'Retired legacy Testnet fixed-pass activation RPC. Testnet API access is wallet-verified and pay-per-call; this function always fails closed.';

comment on table public.testnet_tester_profiles is
  'Private wallet-verified Testnet tester state. Active access is provisioned without an upfront payment and is bounded by the current 30-day metered credit contract.';

comment on table public.testnet_usdc_payment_claims is
  'Replay-protected Testnet USDC payment proofs. Current API claims bind one transaction to one request_id and capability; Testnet settlement is non-revenue.';

comment on table public.testnet_developer_credentials is
  'Private mapping for wallet-verified Testnet developers integrating Geomacro into a product, AI agent, automation or demo. API secrets are never stored in plaintext.';
