-- =============================================================================
-- Geomacro native GDELT pipeline scheduler
--
-- PURPOSE
-- Replace GitHub scheduled mutation as the primary near-live GDELT GAL pipeline
-- scheduler with Supabase-native pg_cron + pg_net while preserving the existing
-- source-rights and customer-delivery boundaries.
--
-- IMPORTANT
-- This migration does NOT install/activate the cron job by itself. Production
-- deployment must first sync the scheduler token into Vault and deploy the
-- orchestrator Edge Function, then call install_gdelt_native_pipeline_cron().
-- =============================================================================

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
create extension if not exists supabase_vault with schema vault;

create table if not exists public.live_pipeline_scheduler_leases (
  pipeline_key text primary key,
  lease_id uuid,
  lease_expires_at timestamptz,
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_status text not null default 'idle'
    check (last_status in ('idle', 'running', 'succeeded', 'failed')),
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.live_pipeline_scheduler_leases enable row level security;
revoke all on table public.live_pipeline_scheduler_leases from PUBLIC, anon, authenticated;
grant select, insert, update on table public.live_pipeline_scheduler_leases to service_role;

insert into public.live_pipeline_scheduler_leases (
  pipeline_key,
  last_status,
  updated_at
)
values (
  'gdelt_gal_native_pipeline',
  'idle',
  now()
)
on conflict (pipeline_key) do nothing;

create or replace function public.verify_gdelt_pipeline_scheduler_token(
  p_token text
)
returns boolean
language sql
stable
security definer
set search_path = public, vault
as $$
  select
    p_token is not null
    and length(p_token) >= 32
    and exists (
      select 1
      from vault.decrypted_secrets
      where name = 'geomacro_gdelt_pipeline_scheduler_token'
        and decrypted_secret = p_token
    );
$$;

revoke all on function public.verify_gdelt_pipeline_scheduler_token(text)
  from PUBLIC, anon, authenticated;
grant execute on function public.verify_gdelt_pipeline_scheduler_token(text)
  to service_role;

create or replace function public.acquire_gdelt_native_pipeline_lease(
  p_lease_id uuid,
  p_ttl_seconds integer default 480
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  acquired boolean := false;
  ttl_seconds integer;
begin
  if p_lease_id is null then
    raise exception 'lease_id_required';
  end if;

  ttl_seconds := greatest(60, least(coalesce(p_ttl_seconds, 480), 900));

  insert into public.live_pipeline_scheduler_leases (
    pipeline_key,
    lease_id,
    lease_expires_at,
    last_started_at,
    last_status,
    last_error,
    updated_at
  )
  values (
    'gdelt_gal_native_pipeline',
    p_lease_id,
    now() + make_interval(secs => ttl_seconds),
    now(),
    'running',
    null,
    now()
  )
  on conflict (pipeline_key) do update
  set
    lease_id = excluded.lease_id,
    lease_expires_at = excluded.lease_expires_at,
    last_started_at = excluded.last_started_at,
    last_status = 'running',
    last_error = null,
    updated_at = now()
  where
    public.live_pipeline_scheduler_leases.lease_expires_at is null
    or public.live_pipeline_scheduler_leases.lease_expires_at <= now()
    or public.live_pipeline_scheduler_leases.lease_id = p_lease_id
  returning true into acquired;

  return coalesce(acquired, false);
end;
$$;

revoke all on function public.acquire_gdelt_native_pipeline_lease(uuid, integer)
  from PUBLIC, anon, authenticated;
grant execute on function public.acquire_gdelt_native_pipeline_lease(uuid, integer)
  to service_role;

create or replace function public.release_gdelt_native_pipeline_lease(
  p_lease_id uuid,
  p_succeeded boolean,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  released boolean := false;
begin
  update public.live_pipeline_scheduler_leases
  set
    lease_id = null,
    lease_expires_at = null,
    last_completed_at = now(),
    last_status = case when p_succeeded then 'succeeded' else 'failed' end,
    last_error = case
      when p_succeeded then null
      else left(coalesce(nullif(trim(p_error), ''), 'unknown_error'), 2000)
    end,
    updated_at = now()
  where pipeline_key = 'gdelt_gal_native_pipeline'
    and lease_id = p_lease_id
  returning true into released;

  return coalesce(released, false);
end;
$$;

revoke all on function public.release_gdelt_native_pipeline_lease(uuid, boolean, text)
  from PUBLIC, anon, authenticated;
grant execute on function public.release_gdelt_native_pipeline_lease(uuid, boolean, text)
  to service_role;

create or replace function public.reconcile_live_structured_event_commercial_rights()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer := 0;
begin
  update public.live_structured_events as event_row
  set
    commercial_eligibility_status = rights.evaluated_status,
    commercial_eligibility_reason_codes = coalesce(rights.reason_codes, '{}'::text[])
  from public.live_structured_event_commercial_rights_evaluation as rights
  where event_row.id = rights.event_id
    and (
      event_row.commercial_eligibility_status is distinct from rights.evaluated_status
      or event_row.commercial_eligibility_reason_codes is distinct from coalesce(rights.reason_codes, '{}'::text[])
    );

  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.reconcile_live_structured_event_commercial_rights()
  from PUBLIC, anon, authenticated;
grant execute on function public.reconcile_live_structured_event_commercial_rights()
  to service_role;

create or replace function public.invoke_gdelt_native_pipeline()
returns bigint
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  scheduler_token text;
  request_id bigint;
begin
  select decrypted_secret
    into scheduler_token
  from vault.decrypted_secrets
  where name = 'geomacro_gdelt_pipeline_scheduler_token'
  order by updated_at desc
  limit 1;

  if scheduler_token is null or length(scheduler_token) < 32 then
    raise exception 'gdelt_pipeline_scheduler_token_missing';
  end if;

  select net.http_post(
    url := 'https://ldpwajisioljyjtojvfx.supabase.co/functions/v1/scheduled-gdelt-pipeline',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-geomacro-scheduler-token', scheduler_token
    ),
    body := jsonb_build_object(
      'trigger', 'supabase_cron',
      'requested_at', now()
    ),
    timeout_milliseconds := 120000
  )
  into request_id;

  return request_id;
end;
$$;

revoke all on function public.invoke_gdelt_native_pipeline()
  from PUBLIC, anon, authenticated, service_role;

create or replace function public.install_gdelt_native_pipeline_cron()
returns bigint
language plpgsql
security definer
set search_path = public, vault, cron
as $$
declare
  scheduler_token text;
  job_id bigint;
begin
  select decrypted_secret
    into scheduler_token
  from vault.decrypted_secrets
  where name = 'geomacro_gdelt_pipeline_scheduler_token'
  order by updated_at desc
  limit 1;

  if scheduler_token is null or length(scheduler_token) < 32 then
    raise exception 'gdelt_pipeline_scheduler_token_missing';
  end if;

  select cron.schedule(
    'geomacro-gdelt-native-pipeline-10m',
    '3,13,23,33,43,53 * * * *',
    'select public.invoke_gdelt_native_pipeline();'
  )
  into job_id;

  return job_id;
end;
$$;

revoke all on function public.install_gdelt_native_pipeline_cron()
  from PUBLIC, anon, authenticated, service_role;

comment on table public.live_pipeline_scheduler_leases is
  'Service-only lease state for scheduled ingestion/structuring pipelines. Not a customer product surface.';
comment on function public.verify_gdelt_pipeline_scheduler_token(text) is
  'Verifies the Vault-backed scheduler token for the GDELT native pipeline orchestrator.';
comment on function public.invoke_gdelt_native_pipeline() is
  'Queues the scheduled GDELT pipeline Edge Function through pg_net. No commercial/public signal activation occurs here.';
comment on function public.install_gdelt_native_pipeline_cron() is
  'Installs/updates the 10-minute Supabase-native GDELT pipeline cron after deployment has synced the Vault token.';
