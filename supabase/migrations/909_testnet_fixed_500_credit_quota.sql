-- Geomacro Testnet tester fixed quota v2
-- One verified email + wallet profile may activate exactly one 500-credit trial quota.
-- Activation requires a verified 0.5 Testnet USDC transfer on any supported testnet.
-- Exact transaction replay is idempotent and never grants credits twice.

alter table public.commercial_credit_accounts
  drop constraint if exists commercial_credit_accounts_tier_check;

alter table public.commercial_credit_accounts
  add constraint commercial_credit_accounts_tier_check
  check (tier in ('free','testnet_tester','analyst_pilot','api_pilot','institutional'));

create or replace function public.ensure_commercial_credit_account(
  p_principal_type text,
  p_principal_id text,
  p_tier text,
  p_contract_version text,
  p_included_credits integer,
  p_period_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.commercial_credit_accounts%rowtype;
  v_now timestamptz := now();
begin
  if p_principal_type not in ('wallet','email','organization','api_client','internal')
    or p_principal_id is null or char_length(p_principal_id) not between 3 and 256
    or p_tier not in ('free','testnet_tester','analyst_pilot','api_pilot','institutional')
    or p_contract_version is null or char_length(p_contract_version) not between 3 and 64
    or p_included_credits is null or p_included_credits < 0
    or p_period_days is null or p_period_days < 1 or p_period_days > 366
  then
    raise exception 'invalid commercial credit account input';
  end if;

  select * into v_account
  from public.commercial_credit_accounts
  where principal_type = p_principal_type
    and principal_id = p_principal_id
  for update;

  if not found then
    insert into public.commercial_credit_accounts (
      principal_type,principal_id,tier,contract_version,included_credits,credits_used,
      period_started_at,period_ends_at
    ) values (
      p_principal_type,p_principal_id,p_tier,p_contract_version,p_included_credits,0,
      v_now,v_now + make_interval(days => p_period_days)
    ) returning * into v_account;
  elsif v_account.period_ends_at <= v_now then
    update public.commercial_credit_accounts set
      tier=p_tier,
      contract_version=p_contract_version,
      included_credits=p_included_credits,
      credits_used=0,
      period_started_at=v_now,
      period_ends_at=v_now + make_interval(days => p_period_days),
      status='active',
      updated_at=v_now
    where id=v_account.id
    returning * into v_account;
  else
    update public.commercial_credit_accounts set
      tier=p_tier,
      contract_version=p_contract_version,
      included_credits=greatest(included_credits,p_included_credits),
      updated_at=v_now
    where id=v_account.id
    returning * into v_account;
  end if;

  return jsonb_build_object(
    'account_id',v_account.id,
    'tier',v_account.tier,
    'included_credits',v_account.included_credits,
    'credits_used',v_account.credits_used,
    'credits_remaining',v_account.included_credits-v_account.credits_used,
    'period_started_at',v_account.period_started_at,
    'period_ends_at',v_account.period_ends_at,
    'status',v_account.status,
    'contract_version',v_account.contract_version
  );
end;
$$;

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
declare
  v_profile public.testnet_tester_profiles%rowtype;
  v_existing_claim public.testnet_usdc_payment_claims%rowtype;
  v_existing_grant public.commercial_entitlement_grants%rowtype;
  v_grant_id uuid;
  v_payment_id uuid;
  v_ends_at timestamptz;
begin
  if p_principal_id is null then raise exception 'TESTNET_PRINCIPAL_REQUIRED'; end if;
  if p_chain_id is null or char_length(trim(p_chain_id)) < 1 then raise exception 'TESTNET_CHAIN_REQUIRED'; end if;
  if p_network_name is null or char_length(trim(p_network_name)) < 2 then raise exception 'TESTNET_NETWORK_REQUIRED'; end if;
  if p_usdc_contract !~ '^0x[0-9a-fA-F]{40}$' then raise exception 'TESTNET_USDC_CONTRACT_INVALID'; end if;
  if p_tx_hash !~ '^0x[0-9a-fA-F]{64}$' then raise exception 'TESTNET_TX_HASH_INVALID'; end if;
  if p_payer_address_hash !~ '^[0-9a-f]{64}$' or p_recipient_address_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'TESTNET_ADDRESS_HASH_INVALID';
  end if;
  if p_amount_atomic < 500000 or p_amount_usdc < 0.5 then raise exception 'TESTNET_USDC_UNDERPAYMENT'; end if;
  if p_block_number is null or p_block_number < 0 then raise exception 'TESTNET_BLOCK_NUMBER_INVALID'; end if;
  if p_registry_version is null or char_length(p_registry_version) < 3
     or p_contract_version is null or char_length(p_contract_version) < 3 then
    raise exception 'TESTNET_ENTITLEMENT_VERSION_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_principal_id::text,0));

  select * into v_profile
  from public.testnet_tester_profiles
  where principal_id=p_principal_id
  for update;

  if not found then raise exception 'TESTNET_PROFILE_NOT_FOUND'; end if;
  if v_profile.registration_status <> 'complete'
    or v_profile.email_verified_at is null
    or v_profile.wallet_verified_at is null
    or v_profile.x_connected_at is null
    or v_profile.discord_connected_at is null then
    raise exception 'TESTNET_REGISTRATION_INCOMPLETE';
  end if;
  if v_profile.suspended_at is not null or v_profile.access_status in ('suspended','revoked') then
    raise exception 'TESTNET_PROFILE_NOT_ACTIVE';
  end if;
  if v_profile.wallet_address_hash <> p_payer_address_hash then
    raise exception 'TESTNET_PAYER_WALLET_MISMATCH';
  end if;

  select * into v_existing_claim
  from public.testnet_usdc_payment_claims
  where chain_id=trim(p_chain_id)
    and lower(tx_hash)=lower(trim(p_tx_hash))
  for update;

  if found then
    if v_existing_claim.principal_id <> p_principal_id then
      raise exception 'TESTNET_PAYMENT_ALREADY_CLAIMED';
    end if;
    if v_existing_claim.verification_status='verified' and v_existing_claim.payment_event_id is not null then
      select entitlement_grant_id into v_grant_id
      from public.commercial_payment_events
      where id=v_existing_claim.payment_event_id;
      return jsonb_build_object(
        'ok',true,
        'idempotent_replay',true,
        'payment_event_id',v_existing_claim.payment_event_id,
        'entitlement_grant_id',v_grant_id,
        'credits_granted',0,
        'quota_credits',500,
        'commercial_revenue',false
      );
    end if;
    raise exception 'TESTNET_PAYMENT_CLAIM_STATE_CONFLICT';
  end if;

  select * into v_existing_grant
  from public.commercial_entitlement_grants
  where principal_id=p_principal_id
    and tier='testnet_tester'
    and metadata->>'offer_id'='testnet_tester_pass_30d'
  order by created_at asc
  limit 1
  for update;

  if found then
    raise exception 'TESTNET_FIXED_QUOTA_ALREADY_ACTIVATED';
  end if;

  v_ends_at := now() + interval '30 days';

  insert into public.commercial_entitlement_grants (
    principal_id,tier,included_credits,contract_version,source_type,source_reference,
    starts_at,ends_at,status,metadata
  ) values (
    p_principal_id,'testnet_tester',500,p_contract_version,'testnet_usdc',
    'testnet-usdc:' || trim(p_chain_id) || ':' || lower(trim(p_tx_hash)),
    now(),v_ends_at,'active',jsonb_build_object(
      'offer_id','testnet_tester_pass_30d',
      'entitlement_kind','testnet_pass',
      'structured_data_registry_version',p_registry_version,
      'payment_environment','testnet',
      'payment_asset','USDC',
      'payment_network',trim(p_network_name),
      'payment_chain_id',trim(p_chain_id),
      'quota_credits',500,
      'quota_price_usdc',0.5,
      'fixed_quota_per_verified_email_and_wallet',true,
      'execution_authorized',false,
      'commercial_revenue',false
    )
  ) returning id into v_grant_id;

  insert into public.commercial_credit_accounts (
    principal_type,principal_id,tier,contract_version,included_credits,credits_used,
    period_started_at,period_ends_at,status
  ) values (
    'api_client',p_principal_id::text,'testnet_tester',p_contract_version,500,0,
    now(),v_ends_at,'active'
  )
  on conflict (principal_type,principal_id)
  do update set
    tier='testnet_tester',
    contract_version=excluded.contract_version,
    included_credits=500,
    credits_used=0,
    period_started_at=excluded.period_started_at,
    period_ends_at=excluded.period_ends_at,
    status='active',
    updated_at=now();

  insert into public.commercial_payment_events (
    environment,network_family,network_name,chain_id,provider,provider_environment,
    payment_method,payment_status,revenue_classification,provider_payment_id,
    principal_id,entitlement_grant_id,offer_id,tier,asset_symbol,asset_contract,
    amount_atomic,amount_decimal,payer_reference_hash,recipient_reference_hash,
    tx_hash,block_number,settled_at,reconciliation_status,commercial_revenue,metadata
  ) values (
    'testnet','evm',trim(p_network_name),trim(p_chain_id),'direct_testnet_usdc','testnet',
    'onchain_usdc','settled','testnet_non_revenue',trim(p_chain_id) || ':' || lower(trim(p_tx_hash)),
    p_principal_id,v_grant_id,'testnet_tester_pass_30d','testnet_tester','USDC',lower(trim(p_usdc_contract)),
    p_amount_atomic,p_amount_usdc,p_payer_address_hash,p_recipient_address_hash,
    lower(trim(p_tx_hash)),p_block_number,now(),'matched',false,jsonb_build_object(
      'testnet_only',true,
      'quota_credits',500,
      'quota_price_usdc',0.5,
      'fixed_quota_per_verified_email_and_wallet',true,
      'execution_authorized',false,
      'upstream_news_source_identity_exposed',false
    )
  ) returning id into v_payment_id;

  insert into public.testnet_usdc_payment_claims (
    principal_id,chain_id,network_name,usdc_contract,tx_hash,payer_address_hash,
    recipient_address_hash,amount_atomic,amount_usdc,verification_status,payment_event_id,verified_at
  ) values (
    p_principal_id,trim(p_chain_id),trim(p_network_name),lower(trim(p_usdc_contract)),lower(trim(p_tx_hash)),
    p_payer_address_hash,p_recipient_address_hash,p_amount_atomic,p_amount_usdc,'verified',v_payment_id,now()
  );

  update public.testnet_tester_profiles
  set current_payment_event_id=v_payment_id,
      current_entitlement_grant_id=v_grant_id,
      access_status='active',
      updated_at=now()
  where id=v_profile.id;

  return jsonb_build_object(
    'ok',true,
    'idempotent_replay',false,
    'payment_event_id',v_payment_id,
    'entitlement_grant_id',v_grant_id,
    'expires_at',v_ends_at,
    'credits_granted',500,
    'quota_credits',500,
    'commercial_revenue',false
  );
end;
$$;
