-- =============================================================================
-- Geomacro Commercial Access Platform v1: idempotency conflict hardening
--
-- A request id may be replayed only when capability, credit cost and contract
-- version are identical to the original use. A mutated retry fails closed and
-- never inherits the earlier debit or entitlement decision.
-- =============================================================================

create or replace function public.consume_commercial_credits(
  p_principal_type text,
  p_principal_id text,
  p_request_id text,
  p_capability text,
  p_credit_cost integer,
  p_contract_version text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.commercial_credit_accounts%rowtype;
  v_existing public.commercial_credit_usage%rowtype;
  v_now timestamptz := now();
  v_remaining integer;
begin
  if p_request_id is null
    or char_length(p_request_id) not between 8 and 160
    or p_capability is null
    or char_length(p_capability) not between 2 and 80
    or p_credit_cost is null
    or p_credit_cost <= 0
    or p_contract_version is null
    or char_length(p_contract_version) not between 3 and 64
  then
    raise exception 'invalid commercial credit consumption input';
  end if;

  select *
    into v_account
  from public.commercial_credit_accounts
  where principal_type = p_principal_type
    and principal_id = p_principal_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'CREDIT_ACCOUNT_NOT_FOUND');
  end if;

  if v_account.status <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'CREDIT_ACCOUNT_INACTIVE');
  end if;

  if v_account.period_ends_at <= v_now then
    return jsonb_build_object('ok', false, 'code', 'CREDIT_PERIOD_EXPIRED');
  end if;

  select *
    into v_existing
  from public.commercial_credit_usage
  where account_id = v_account.id
    and request_id = p_request_id;

  if found then
    if v_existing.capability <> p_capability
      or v_existing.credit_cost <> p_credit_cost
      or v_existing.contract_version <> p_contract_version
    then
      return jsonb_build_object(
        'ok', false,
        'code', 'IDEMPOTENCY_CONFLICT',
        'original_capability', v_existing.capability,
        'original_credit_cost', v_existing.credit_cost,
        'original_contract_version', v_existing.contract_version
      );
    end if;

    v_remaining := v_account.included_credits - v_account.credits_used;
    return jsonb_build_object(
      'ok', true,
      'idempotent_replay', true,
      'credit_cost', v_existing.credit_cost,
      'credits_remaining', v_remaining,
      'period_ends_at', v_account.period_ends_at
    );
  end if;

  if v_account.credits_used + p_credit_cost > v_account.included_credits then
    return jsonb_build_object(
      'ok', false,
      'code', 'INSUFFICIENT_CREDITS',
      'credits_remaining', v_account.included_credits - v_account.credits_used,
      'period_ends_at', v_account.period_ends_at
    );
  end if;

  update public.commercial_credit_accounts
  set
    credits_used = credits_used + p_credit_cost,
    updated_at = v_now
  where id = v_account.id
  returning * into v_account;

  insert into public.commercial_credit_usage (
    account_id,
    request_id,
    capability,
    credit_cost,
    contract_version
  ) values (
    v_account.id,
    p_request_id,
    p_capability,
    p_credit_cost,
    p_contract_version
  );

  return jsonb_build_object(
    'ok', true,
    'idempotent_replay', false,
    'credit_cost', p_credit_cost,
    'credits_remaining', v_account.included_credits - v_account.credits_used,
    'period_ends_at', v_account.period_ends_at
  );
end;
$$;

revoke all on function public.consume_commercial_credits(text, text, text, text, integer, text)
  from PUBLIC, anon, authenticated;
grant execute on function public.consume_commercial_credits(text, text, text, text, integer, text)
  to service_role;

comment on function public.consume_commercial_credits(text, text, text, text, integer, text) is
  'Atomically consumes credits once per request id; exact retries are idempotent and mutated request-id replays fail with IDEMPOTENCY_CONFLICT.';
