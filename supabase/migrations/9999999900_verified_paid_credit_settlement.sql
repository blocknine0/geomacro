-- GeoMacro: payment-backed new-sale credits. Independent of PREDGE, testnet
-- and the x402 per-call rail. NO capture is authorized by this migration.
-- The service must independently verify a PayPal LIVE capture (signature,
-- provider capture GET, immutable order id, exact amount and currency).
begin;

create table if not exists public.commercial_paid_order_intents (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null references public.commercial_principals(id),
  provider text not null default 'paypal' check (provider = 'paypal'),
  provider_environment text not null check (provider_environment in ('sandbox','live')),
  provider_order_id text unique,
  sku text not null check (sku in ('starter_dev','pro_analyst','business_pilot',
    'starter_pack','standard_pack','growth_pack')),
  usd_cents integer not null check (usd_cents > 0),
  credits integer not null check (credits > 0),
  tier text not null check (tier in ('starter_dev','pro_analyst','business_pilot')),
  kind text not null check (kind in ('subscription','credit_pack')),
  state text not null default 'prepared'
    check (state in ('prepared','provider_order_created','settled','refunded')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  settled_at timestamptz,
  check (expires_at > created_at)
);
create index if not exists commercial_paid_intents_principal_idx
  on public.commercial_paid_order_intents(principal_id,created_at desc);

create table if not exists public.commercial_paid_credit_receipts (
  id uuid primary key default gen_random_uuid(),
  intent_id uuid not null unique references public.commercial_paid_order_intents(id),
  provider text not null check (provider = 'paypal'),
  provider_environment text not null check (provider_environment = 'live'),
  provider_order_id text not null unique,
  provider_capture_id text not null unique,
  paid_usd_cents integer not null check (paid_usd_cents > 0),
  currency text not null check (currency = 'USD'),
  credits_issued integer not null check (credits_issued > 0),
  principal_id uuid not null references public.commercial_principals(id),
  entitlement_grant_id uuid not null references public.commercial_entitlement_grants(id),
  captured_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  refunded_at timestamptz,
  refund_id text unique
);

alter table public.commercial_paid_order_intents enable row level security;
alter table public.commercial_paid_credit_receipts enable row level security;
revoke all on public.commercial_paid_order_intents from public, anon, authenticated;
revoke all on public.commercial_paid_credit_receipts from public, anon, authenticated;
grant all on public.commercial_paid_order_intents to service_role;
grant all on public.commercial_paid_credit_receipts to service_role;

-- Only a server-authenticated, canonical principal can reserve an intent.
-- Prices and SKU -> credit grants are computed SERVER-SIDE by this RPC.
create or replace function public.prepare_commercial_paid_order(
  p_principal_id uuid, p_sku text, p_environment text default 'sandbox'
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_amount integer; v_credits integer; v_tier text; v_kind text;
  v_id uuid;
begin
  if p_environment not in ('sandbox','live') then
    raise exception 'INVALID_PAYMENT_ENVIRONMENT';
  end if;
  if not exists(select 1 from public.commercial_principals
    where id=p_principal_id and status='active') then
    raise exception 'COMMERCIAL_PRINCIPAL_INACTIVE';
  end if;
  case p_sku
    when 'starter_dev' then v_amount:=900; v_credits:=1000; v_tier:='starter_dev'; v_kind:='subscription';
    when 'pro_analyst' then v_amount:=2900; v_credits:=5000; v_tier:='pro_analyst'; v_kind:='subscription';
    when 'business_pilot' then v_amount:=9900; v_credits:=25000; v_tier:='business_pilot'; v_kind:='subscription';
    when 'starter_pack' then v_amount:=500; v_credits:=100; v_tier:='starter_dev'; v_kind:='credit_pack';
    when 'standard_pack' then v_amount:=1500; v_credits:=500; v_tier:='starter_dev'; v_kind:='credit_pack';
    when 'growth_pack' then v_amount:=3000; v_credits:=1500; v_tier:='starter_dev'; v_kind:='credit_pack';
    else raise exception 'SKU_NOT_APPROVED';
  end case;
  insert into public.commercial_paid_order_intents
    (principal_id,provider_environment,sku,usd_cents,credits,tier,kind)
    values(p_principal_id,p_environment,p_sku,v_amount,v_credits,v_tier,v_kind)
    returning id into v_id;
  return jsonb_build_object('intent_id',v_id,'sku',p_sku,'amount_usd_cents',v_amount,
    'currency','USD','credits',v_credits,'kind',v_kind,'expires_in_seconds',86400);
end; $$;

create or replace function public.bind_commercial_paypal_order(
  p_intent_id uuid, p_order_id text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_row public.commercial_paid_order_intents%rowtype;
begin
  if p_order_id is null or p_order_id !~ '^[A-Za-z0-9-]{6,80}$'
    then raise exception 'PAYPAL_ORDER_ID_INVALID'; end if;
  select * into v_row from public.commercial_paid_order_intents
    where id=p_intent_id for update;
  if not found or v_row.expires_at<=now() then
    raise exception 'PAYPAL_INTENT_EXPIRED_OR_MISSING'; end if;
  if v_row.state='provider_order_created' and v_row.provider_order_id=p_order_id
    then return jsonb_build_object('ok',true,'idempotent_replay',true); end if;
  if v_row.state<>'prepared' then raise exception 'PAYPAL_INTENT_NOT_PREPARED'; end if;
  update public.commercial_paid_order_intents set
    provider_order_id=p_order_id,state='provider_order_created'
    where id=p_intent_id;
  return jsonb_build_object('ok',true,'idempotent_replay',false);
end; $$;

-- Called ONLY after PayPal webhook signature verification PLUS separate PayPal
-- LIVE capture readback; provider proof may never be accepted from a browser.
-- Capture/order unique constraints and principal advisory lock serialize retries.
create or replace function public.settle_commercial_paypal_credits(
  p_order_id text, p_capture_id text, p_usd_cents integer,
  p_currency text, p_captured_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_intent public.commercial_paid_order_intents%rowtype;
  v_existing public.commercial_paid_credit_receipts%rowtype;
  v_account public.commercial_credit_accounts%rowtype;
  v_grant uuid; v_tier text; v_end timestamptz; v_start timestamptz:=now();
begin
  if p_order_id is null or p_order_id !~ '^[A-Za-z0-9-]{6,80}$'
    or p_capture_id is null or p_capture_id !~ '^[A-Za-z0-9-]{6,100}$'
    or p_usd_cents is null or p_currency<>'USD' or p_captured_at is null
    or p_captured_at>now()+interval '5 minutes'
    then raise exception 'CAPTURE_PROOF_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('paypal-capture:'||p_capture_id,0));
  select * into v_existing from public.commercial_paid_credit_receipts
    where provider_capture_id=p_capture_id for update;
  if found then
    if v_existing.provider_order_id<>p_order_id or v_existing.paid_usd_cents<>p_usd_cents
      or v_existing.currency<>p_currency or v_existing.refunded_at is not null
      then raise exception 'PAYPAL_CAPTURE_REPLAY_CONFLICT'; end if;
    return jsonb_build_object('ok',true,'idempotent_replay',true,
      'credits_issued',v_existing.credits_issued);
  end if;
  select * into v_intent from public.commercial_paid_order_intents
    where provider_order_id=p_order_id for update;
  if not found or v_intent.state<>'provider_order_created'
    or v_intent.provider_environment<>'live' or v_intent.provider<>'paypal'
    or v_intent.usd_cents<>p_usd_cents or p_captured_at>v_intent.expires_at
    or p_captured_at<v_intent.created_at-interval '5 minutes'
    then raise exception 'PAYPAL_CAPTURE_INTENT_MISMATCH'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'paid-credit-principal:'||v_intent.principal_id::text,0));
  if not exists(select 1 from public.commercial_principals
    where id=v_intent.principal_id and status='active')
    then raise exception 'PAID_CREDIT_PRINCIPAL_INACTIVE'; end if;
  select * into v_account from public.commercial_credit_accounts
    where principal_type='api_client' and principal_id=v_intent.principal_id::text
    for update;
  if v_intent.kind='credit_pack' and found
    and v_account.status='active' and v_account.period_ends_at>v_start
    and v_account.tier in ('starter_dev','pro_analyst','business_pilot')
    then
      v_tier:=v_account.tier; v_end:=v_account.period_ends_at;
      update public.commercial_credit_accounts
        set included_credits=included_credits+v_intent.credits,updated_at=v_start
        where id=v_account.id;
      select id into v_grant from public.commercial_entitlement_grants
        where principal_id=v_intent.principal_id and status='active'
        and tier=v_tier and contract_version='credits-v1.1.0'
        and starts_at<=v_start and ends_at>v_start
        order by ends_at desc limit 1;
    else
      v_tier:=v_intent.tier;v_end:=v_start+interval '30 days';
      if v_account.id is null then
        insert into public.commercial_credit_accounts
          (principal_type,principal_id,tier,contract_version,
           included_credits,credits_used,period_started_at,period_ends_at,status)
        values ('api_client',v_intent.principal_id::text,v_tier,'credits-v1.1.0',
          v_intent.credits,0,v_start,v_end,'active');
      else
        update public.commercial_credit_accounts set
          tier=v_tier,contract_version='credits-v1.1.0',
          included_credits=v_intent.credits,credits_used=0,
          period_started_at=v_start,period_ends_at=v_end,status='active',
          updated_at=v_start where id=v_account.id;
      end if;
      -- New subscribed period supersedes old provider grants. Legacy/testnet
      -- grants and their immutable evidence are not deleted.
      update public.commercial_entitlement_grants set
        status='expired' where principal_id=v_intent.principal_id
        and status='active' and source_type='payment_provider';
    end if;
  if v_grant is null then
    insert into public.commercial_entitlement_grants
      (principal_id,tier,included_credits,contract_version,source_type,
       source_reference,starts_at,ends_at,status,metadata)
    values(v_intent.principal_id,v_tier,v_intent.credits,'credits-v1.1.0',
      'payment_provider',p_capture_id,v_start,v_end,'active',
      jsonb_build_object('payment_provider','paypal','sku',v_intent.sku,
                         'funded_by_capture',p_capture_id))
    returning id into v_grant;
  end if;
  insert into public.commercial_paid_credit_receipts
    (intent_id,provider,provider_environment,provider_order_id,provider_capture_id,
     paid_usd_cents,currency,credits_issued,principal_id,entitlement_grant_id,captured_at)
    values(v_intent.id,'paypal','live',p_order_id,p_capture_id,p_usd_cents,
      'USD',v_intent.credits,v_intent.principal_id,v_grant,p_captured_at);
  update public.commercial_paid_order_intents set state='settled',settled_at=v_start
    where id=v_intent.id;
  return jsonb_build_object('ok',true,'idempotent_replay',false,
    'credits_issued',v_intent.credits,'tier',v_tier,
    'period_ends_at',v_end,'grant_id',v_grant);
end; $$;

-- Full capture refunds immediately suspend potentially spent credits; any
-- chargeback requires review. No negative credit balance is manufactured.
create or replace function public.revoke_refunded_paypal_credits(
  p_capture_id text,p_refund_id text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_receipt public.commercial_paid_credit_receipts%rowtype;
begin
  if p_capture_id is null or p_refund_id is null or
     p_capture_id !~ '^[A-Za-z0-9-]{6,100}$' or
     p_refund_id !~ '^[A-Za-z0-9-]{6,100}$' then
    raise exception 'REFUND_PROOF_INVALID'; end if;
  select * into v_receipt from public.commercial_paid_credit_receipts
    where provider_capture_id=p_capture_id for update;
  if not found then return jsonb_build_object('ok',false,'code','CAPTURE_NOT_FOUND'); end if;
  if v_receipt.refunded_at is not null then
    if v_receipt.refund_id<>p_refund_id then raise exception 'REFUND_REPLAY_CONFLICT'; end if;
    return jsonb_build_object('ok',true,'idempotent_replay',true);
  end if;
  update public.commercial_paid_credit_receipts
    set refunded_at=now(),refund_id=p_refund_id where id=v_receipt.id;
  update public.commercial_paid_order_intents set state='refunded'
    where id=v_receipt.intent_id;
  update public.commercial_credit_accounts set status='suspended',updated_at=now()
    where principal_type='api_client' and principal_id=v_receipt.principal_id::text;
  update public.commercial_entitlement_grants set
    status='suspended' where id=v_receipt.entitlement_grant_id;
  return jsonb_build_object('ok',true,'idempotent_replay',false,
    'account_suspended_for_reconciliation',true);
end; $$;

revoke all on function public.prepare_commercial_paid_order(uuid,text,text)
  from public,anon,authenticated;
revoke all on function public.bind_commercial_paypal_order(uuid,text)
  from public,anon,authenticated;
revoke all on function public.settle_commercial_paypal_credits(text,text,integer,text,timestamptz)
  from public,anon,authenticated;
revoke all on function public.revoke_refunded_paypal_credits(text,text)
  from public,anon,authenticated;
grant execute on function public.prepare_commercial_paid_order(uuid,text,text) to service_role;
grant execute on function public.bind_commercial_paypal_order(uuid,text) to service_role;
grant execute on function public.settle_commercial_paypal_credits(text,text,integer,text,timestamptz) to service_role;
grant execute on function public.revoke_refunded_paypal_credits(text,text) to service_role;
commit;
