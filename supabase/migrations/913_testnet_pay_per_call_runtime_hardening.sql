-- =============================================================================
-- Geomacro Testnet pay-per-call runtime hardening
--
-- Testnet only. This migration does not change mainnet/commercial pricing and
-- does not rewrite historical Testnet settlement records.
-- =============================================================================

-- Keep every future testnet_tester grant aligned with the canonical metered
-- contract, regardless of which privileged server path creates or updates it.
drop trigger if exists trg_align_testnet_tester_grant_metadata
  on public.commercial_entitlement_grants;

create trigger trg_align_testnet_tester_grant_metadata
before insert or update on public.commercial_entitlement_grants
for each row
execute function public.align_testnet_tester_grant_metadata();

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
