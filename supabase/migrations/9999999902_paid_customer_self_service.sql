-- GeoMacro commercial customer self-service on canonical Supabase only.
-- Independently verified email OTP never grants credits. Only a settled
-- payment-provider entitlement and active positive balance permits API keys.
-- RLS stays enabled; all service-role functions explicitly refuse public grants.
begin;

create or replace function public.issue_paid_customer_api_key(
 p_auth_user_id uuid,p_key_id text,p_key_hash text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_principal public.commercial_principals%rowtype;
 v_account public.commercial_credit_accounts%rowtype;
 v_count int;
begin
 if p_auth_user_id is null or p_key_id !~ '^gmk_live_[A-Za-z0-9_-]{10,60}$'
    or p_key_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok',false,'code','INVALID_KEY_REQUEST');
 end if;
 select * into v_principal from public.commercial_principals
  where principal_type='api_client' and external_id='auth:'||p_auth_user_id::text
  and status='active' for update;
 if not found then
  return jsonb_build_object('ok',false,'code','CUSTOMER_PRINCIPAL_REQUIRED');
 end if;
 -- The lock serializes concurrent API key creates per customer across workers.
 perform pg_advisory_xact_lock(hashtextextended('paid_api_key:'||v_principal.id::text,0));
 select * into v_account from public.commercial_credit_accounts
  where principal_type='api_client' and principal_id=v_principal.id::text
  and status='active' and tier in ('starter_dev','pro_analyst','business_pilot')
  and period_started_at<=now() and period_ends_at>now()
  and included_credits>credits_used for share;
 if not found then
  return jsonb_build_object('ok',false,'code','VERIFIED_CREDIT_BALANCE_REQUIRED');
 end if;
 if not exists (select 1 from public.commercial_entitlement_grants
   where principal_id=v_principal.id and status='active'
    and tier=v_account.tier and source_type='payment_provider'
    and contract_version=v_account.contract_version
    and starts_at<=now() and ends_at>now()) then
  return jsonb_build_object('ok',false,'code','VERIFIED_PAYMENT_ENTITLEMENT_REQUIRED');
 end if;
 select count(*) into v_count from public.commercial_api_credentials
  where principal_id=v_principal.id and enabled=true and revoked_at is null
    and (expires_at is null or expires_at>now());
 if v_count>=3 then
  return jsonb_build_object('ok',false,'code','MAX_THREE_ACTIVE_KEYS');
 end if;
 if exists(select 1 from public.commercial_api_credentials
   where principal_id=v_principal.id and created_at>now()-interval '60 seconds')
 then
  return jsonb_build_object('ok',false,'code','KEY_CREATION_COOLDOWN');
 end if;
 insert into public.commercial_api_credentials
   (principal_id,key_id,api_key_hash,enabled,scopes,expires_at)
 values (v_principal.id,p_key_id,p_key_hash,true,
   array['intelligence:read']::text[],least(v_account.period_ends_at,now()+interval '30 days'));
 return jsonb_build_object('ok',true,'key_id',p_key_id);
exception when unique_violation then
 return jsonb_build_object('ok',false,'code','CREDENTIAL_COLLISION');
end;
$$;

create or replace function public.revoke_paid_customer_api_key(
 p_auth_user_id uuid,p_key_id text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_principal_id uuid; v_count integer;
begin
 if p_auth_user_id is null or p_key_id !~ '^gmk_live_[A-Za-z0-9_-]{10,60}$' then
  return jsonb_build_object('ok',false,'code','INVALID_KEY_REQUEST');
 end if;
 select id into v_principal_id from public.commercial_principals
  where principal_type='api_client' and external_id='auth:'||p_auth_user_id::text
  and status='active';
 if v_principal_id is null then
  return jsonb_build_object('ok',false,'code','CUSTOMER_PRINCIPAL_REQUIRED');
 end if;
 update public.commercial_api_credentials set enabled=false,revoked_at=now()
  where principal_id=v_principal_id and key_id=p_key_id
   and enabled=true and revoked_at is null;
 get diagnostics v_count=row_count;
 return jsonb_build_object('ok',true,'revoked',v_count>0);
end;
$$;

revoke all on function public.issue_paid_customer_api_key(uuid,text,text) from public,anon,authenticated;
grant execute on function public.issue_paid_customer_api_key(uuid,text,text) to service_role;
revoke all on function public.revoke_paid_customer_api_key(uuid,text) from public,anon,authenticated;
grant execute on function public.revoke_paid_customer_api_key(uuid,text) to service_role;
commit;
