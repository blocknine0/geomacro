-- Live isolated RESEARCH-ONLY 20m stream, applied to ymjuwuvbialsevfawvvq.
-- Do not apply to canonical D1, commercial risk payments or Predge.
-- Secrets generated in Supabase Vault, NEVER checked into GitHub.
-- Existing Phase 2I research atomic country_risk_state RPC stays unchanged.
create extension if not exists pg_net with schema extensions;
create table if not exists public.gm_research_stream20m_runs(
 id bigint generated always as identity primary key,
 started_at timestamptz not null default now(),
 finished_at timestamptz not null default now(),
 status text not null check(status in
 ('NO_FRESH_QUALIFIED','SOURCE_PARTIAL','SOURCE_UNAVAILABLE',
  'STATE_UPDATED','SIGNED_UPDATED','INTERNAL_ERROR')),
 source_count integer not null default 0 check(source_count between 0 and 12),
 source_http_healthy integer not null default 0 check(source_http_healthy between 0 and 12),
 candidate_count integer not null default 0 check(candidate_count between 0 and 24),
 original_pages_verified integer not null default 0 check(original_pages_verified between 0 and 24),
 state_updated integer not null default 0 check(state_updated between 0 and 24),
 signed_verified integer not null default 0 check(signed_verified between 0 and 24),
 failures integer not null default 0 check(failures between 0 and 64),
 execution_authorized boolean not null default false check(execution_authorized=false),
 commercial_eligible boolean not null default false check(commercial_eligible=false)
);
alter table public.gm_research_stream20m_runs enable row level security;
revoke all on public.gm_research_stream20m_runs from public, anon, authenticated;
grant select,insert on public.gm_research_stream20m_runs to service_role;
revoke all on sequence public.gm_research_stream20m_runs_id_seq from public,anon,authenticated;
grant usage,select on sequence public.gm_research_stream20m_runs_id_seq to service_role;

create or replace function public.gm_research_stream20m_auth(p_token text)
returns boolean language sql stable security definer set search_path='' as $fn$
 select p_token is not null and length(p_token)=64 and exists(
 select 1 from vault.decrypted_secrets
 where name='gm_research_stream20m_cron_token_v1' and decrypted_secret=p_token);
$fn$;
revoke all on function public.gm_research_stream20m_auth(text) from public,anon,authenticated;
grant execute on function public.gm_research_stream20m_auth(text) to service_role;

create or replace function public.gm_research_stream20m_read_auth(p_token text)
returns boolean language sql stable security definer set search_path='' as $fn$
 select p_token is not null and length(p_token)=64 and exists(
 select 1 from vault.decrypted_secrets
 where name='gm_research_stream20m_read_token_v1' and decrypted_secret=p_token);
$fn$;
revoke all on function public.gm_research_stream20m_read_auth(text) from public,anon,authenticated;
grant execute on function public.gm_research_stream20m_read_auth(text) to service_role;

create or replace function public.gm_research_stream20m_signer()
returns jsonb language sql stable security definer set search_path='' as $fn$
 select case when count(*)=2 then pg_catalog.jsonb_build_object(
 'private_pkcs8_b64',max(decrypted_secret) filter(where name='gm_research_stream20m_private_pkcs8_v1'),
 'public_spki_b64',max(decrypted_secret) filter(where name='gm_research_stream20m_public_spki_v1'),
 'key_id','geomacro-research-2026-11-supabase')
 else null end
 from vault.decrypted_secrets where name in
 ('gm_research_stream20m_private_pkcs8_v1','gm_research_stream20m_public_spki_v1');
$fn$;
revoke all on function public.gm_research_stream20m_signer() from public,anon,authenticated;
grant execute on function public.gm_research_stream20m_signer() to service_role;

create or replace function public.gm_research_stream20m_verifier()
returns jsonb language sql stable security definer set search_path='' as $fn$
 select case when count(*)=1 then pg_catalog.jsonb_build_object(
 'public_spki_b64',max(decrypted_secret),
 'key_id','geomacro-research-2026-11-supabase')
 else null end
 from vault.decrypted_secrets
 where name='gm_research_stream20m_public_spki_v1';
$fn$;
revoke all on function public.gm_research_stream20m_verifier() from public,anon,authenticated;
grant execute on function public.gm_research_stream20m_verifier() to service_role;

create or replace function public.gm_research_stream20m_provision_signer(
 p_private_pkcs8_b64 text,p_public_spki_b64 text)
returns boolean language plpgsql volatile security definer set search_path='' as $fn$
begin
 perform pg_catalog.pg_advisory_xact_lock(9012026,20);
 if length(coalesce(p_private_pkcs8_b64,'')) not between 50 and 400
   or length(coalesce(p_public_spki_b64,'')) not between 50 and 200
   or p_private_pkcs8_b64 !~ '^[A-Za-z0-9+/]+={0,2}$'
   or p_public_spki_b64 !~ '^[A-Za-z0-9+/]+={0,2}$'
 then raise exception 'RESEARCH_SIGNER_BYTES_INVALID'; end if;
 if exists(select 1 from vault.secrets where name in
 ('gm_research_stream20m_private_pkcs8_v1','gm_research_stream20m_public_spki_v1'))
 then return false; end if;
 perform vault.create_secret(p_private_pkcs8_b64,
  'gm_research_stream20m_private_pkcs8_v1','Research-only PKCS8 signer');
 perform vault.create_secret(p_public_spki_b64,
  'gm_research_stream20m_public_spki_v1','Research-only SPKI verifier');
 return true;
end;
$fn$;
revoke all on function public.gm_research_stream20m_provision_signer(text,text)
 from public,anon,authenticated;
grant execute on function public.gm_research_stream20m_provision_signer(text,text)
 to service_role;

do $body$begin
 if not exists(select 1 from vault.secrets where name='gm_research_stream20m_cron_token_v1') then
  perform vault.create_secret(pg_catalog.encode(extensions.gen_random_bytes(32),'hex'),
   'gm_research_stream20m_cron_token_v1','Research-only cron token');
 end if;
 if not exists(select 1 from vault.secrets where name='gm_research_stream20m_read_token_v1') then
  perform vault.create_secret(pg_catalog.encode(extensions.gen_random_bytes(32),'hex'),
   'gm_research_stream20m_read_token_v1','Private research client read token');
 end if;
end$body$;

-- The background producer is QUEUE-FREE for signing and research decisions.
-- Existing canonical D1/B2 original-evidence preservation is not altered.
select cron.schedule(
 'geomacro-research-stream20m-direct-production',
 '11,31,51 * * * *',
 $job$
 select net.http_post(
  url:='https://ymjuwuvbialsevfawvvq.supabase.co/functions/v1/gm-research-stream20m',
  headers:=jsonb_build_object('Content-Type','application/json',
   'x-gm-research-cron',(select decrypted_secret from vault.decrypted_secrets
    where name='gm_research_stream20m_cron_token_v1')),
  body:='{}'::jsonb,timeout_milliseconds:=120000) as request_id;
 $job$
);
-- Recovery runs ONLY when no healthy producer receipt was stored
-- in the prior nine minutes. Repeated news is evidence-SHA deduped by RPC.
select cron.schedule(
 'geomacro-research-stream20m-recovery-backstop',
 '19,39,59 * * * *',
 $job$
 select net.http_post(
  url:='https://ymjuwuvbialsevfawvvq.supabase.co/functions/v1/gm-research-stream20m',
  headers:=jsonb_build_object('Content-Type','application/json',
   'x-gm-research-cron',(select decrypted_secret from vault.decrypted_secrets
    where name='gm_research_stream20m_cron_token_v1')),
  body:='{}'::jsonb,timeout_milliseconds:=120000)
 where not exists(
  select 1 from public.gm_research_stream20m_runs
  where finished_at>=now()-interval '9 minutes'
   and status in ('NO_FRESH_QUALIFIED','SOURCE_PARTIAL',
    'STATE_UPDATED','SIGNED_UPDATED'));
 $job$
);
