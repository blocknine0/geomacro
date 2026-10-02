alter table public.risk_gate_api_clients
  add column if not exists access_tier text not null default 'private_pilot',
  add column if not exists quota_class text not null default 'limited_free_quota',
  add column if not exists daily_request_limit integer null;

alter table public.risk_gate_api_clients
  drop constraint if exists risk_gate_api_clients_access_tier_check,
  add constraint risk_gate_api_clients_access_tier_check
    check (access_tier in ('design_partner_pilot','private_pilot','paid_x402')),
  drop constraint if exists risk_gate_api_clients_quota_class_check,
  add constraint risk_gate_api_clients_quota_class_check
    check (quota_class in ('limited_free_quota','commercial')),
  drop constraint if exists risk_gate_api_clients_daily_request_limit_check,
  add constraint risk_gate_api_clients_daily_request_limit_check
    check (daily_request_limit is null or daily_request_limit between 1 and 1000000);

create table if not exists public.risk_gate_daily_usage (
  client_id text not null references public.risk_gate_api_clients(client_id) on delete cascade,
  usage_day date not null default current_date,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (client_id, usage_day)
);

alter table public.risk_gate_daily_usage enable row level security;
revoke all on table public.risk_gate_daily_usage from anon, authenticated;

create or replace function public.consume_risk_gate_daily_limit(
  p_client_id text,
  p_limit integer
)
returns table (
  allowed boolean,
  request_count integer,
  limit_count integer,
  usage_day date
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_day date := current_date;
  v_count integer;
begin
  if p_limit is null or p_limit < 1 then
    raise exception 'daily request limit must be a positive integer';
  end if;

  select d.request_count
    into v_count
    from public.risk_gate_daily_usage d
   where d.client_id = p_client_id
     and d.usage_day = v_day
   for update;

  if not found then
    insert into public.risk_gate_daily_usage(client_id, usage_day, request_count, updated_at)
    values (p_client_id, v_day, 1, now());
    v_count := 1;
    return query select true, v_count, p_limit, v_day;
    return;
  end if;

  if v_count >= p_limit then
    return query select false, v_count, p_limit, v_day;
    return;
  end if;

  v_count := v_count + 1;
  update public.risk_gate_daily_usage
     set request_count = v_count,
         updated_at = now()
   where client_id = p_client_id
     and usage_day = v_day;

  return query select true, v_count, p_limit, v_day;
end;
$$;

revoke all on function public.consume_risk_gate_daily_limit(text, integer) from public, anon, authenticated;
grant execute on function public.consume_risk_gate_daily_limit(text, integer) to service_role;
