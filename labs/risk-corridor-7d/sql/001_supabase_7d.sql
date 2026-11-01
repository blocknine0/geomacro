-- APPLY ONLY to a NEW dedicated Supabase project, never to GeoMacro's existing Supabase.
-- A supplementary operational buffer: no raw article payload, customer secret, billing or canonical GRO.
create table if not exists public.geomacro_risk_signal_7d (
  id bigint generated always as identity primary key,
  event_sha256 text not null check (event_sha256 ~ '^[a-f0-9]{64}$'),
  verified_gro_sha256 text not null check (verified_gro_sha256 ~ '^[a-f0-9]{64}$'),
  country_iso3 text not null check (country_iso3 ~ '^[A-Z]{3}$'),
  domain text not null check (domain in ('geopolitics','macro_fx','critical_minerals')),
  signal_kind text not null check (signal_kind ~ '^[a-z_]{1,64}$'),
  intensity numeric(6,3) not null check (intensity >= 0 and intensity <= 100),
  verification_status text not null default 'VERIFIED' check (verification_status = 'VERIFIED'),
  original_at timestamptz not null,
  ingested_at timestamptz not null default now(),
  unique(event_sha256,country_iso3,domain)
);
create index if not exists gm_rc_signal_ttl on public.geomacro_risk_signal_7d(ingested_at);
create index if not exists gm_rc_signal_lookup on public.geomacro_risk_signal_7d(country_iso3,domain,ingested_at desc);

create table if not exists public.geomacro_corridor_candidate_7d (
  id bigint generated always as identity primary key,
  candidate_sha256 text not null unique check (candidate_sha256 ~ '^[a-f0-9]{64}$'),
  origin_country_iso3 text not null check (origin_country_iso3 ~ '^[A-Z]{3}$'),
  destination_country_iso3 text not null check (destination_country_iso3 ~ '^[A-Z]{3}$'),
  evidence_gro_sha256 text not null check (evidence_gro_sha256 ~ '^[a-f0-9]{64}$'),
  candidate_status text not null default 'UNSCORED' check (candidate_status in ('UNSCORED','REJECTED','VERIFIED_EXPOSURE')),
  exposure_kind text not null check (exposure_kind ~ '^[a-z_]{1,64}$'),
  ingested_at timestamptz not null default now(),
  check(origin_country_iso3 <> destination_country_iso3)
);
create index if not exists gm_rc_corridor_ttl on public.geomacro_corridor_candidate_7d(ingested_at);

create table if not exists public.geomacro_risk_assessment_7d (
  assessment_sha256 text primary key check (assessment_sha256 ~ '^[a-f0-9]{64}$'),
  subject_type text not null check (subject_type in ('country','corridor')),
  subject_id text not null,
  tier text not null check (tier in ('BASIC','STANDARD','COMPLEX')),
  gro_sha256 text not null check (gro_sha256 ~ '^[a-f0-9]{64}$'),
  assessment_status text not null check (assessment_status in ('VERIFIED','INSUFFICIENT')),
  result_sha256 text not null check (result_sha256 ~ '^[a-f0-9]{64}$'),
  ingested_at timestamptz not null default now()
);
create index if not exists gm_rc_assessment_ttl on public.geomacro_risk_assessment_7d(ingested_at);

-- Persistent technical cursor only; no retained personal data or raw evidence.
create table if not exists public.geomacro_buffer_operational_state (
  cursor_key text primary key,
  cursor_value text not null,
  updated_at timestamptz not null default now()
);

alter table public.geomacro_risk_signal_7d enable row level security;
alter table public.geomacro_corridor_candidate_7d enable row level security;
alter table public.geomacro_risk_assessment_7d enable row level security;
alter table public.geomacro_buffer_operational_state enable row level security;
revoke all on public.geomacro_risk_signal_7d, public.geomacro_corridor_candidate_7d,
  public.geomacro_risk_assessment_7d, public.geomacro_buffer_operational_state
  from anon, authenticated, public;
grant select,insert,update,delete on public.geomacro_risk_signal_7d,
  public.geomacro_corridor_candidate_7d,public.geomacro_risk_assessment_7d,
  public.geomacro_buffer_operational_state to service_role;
grant usage,select on all sequences in schema public to service_role;

-- Read-side TTL remains mandatory; scheduling is best-effort under free project pause.
create or replace function public.geomacro_purge_risk_buffer_7d()
returns void language plpgsql security definer set search_path=pg_catalog,public as $fn$
declare
  cutoff timestamptz := now() - interval '7 days';
begin
  delete from public.geomacro_risk_signal_7d where ingested_at < cutoff;
  delete from public.geomacro_corridor_candidate_7d where ingested_at < cutoff;
  delete from public.geomacro_risk_assessment_7d where ingested_at < cutoff;
end;
$fn$;
revoke all on function public.geomacro_purge_risk_buffer_7d() from public,anon,authenticated;
grant execute on function public.geomacro_purge_risk_buffer_7d() to service_role;

-- Requires pg_cron enabled for this new Supabase project in the Dashboard.
-- Run after extension enablement, only in the new project:
-- select cron.schedule('geomacro-risk-buffer-seven-day-hourly','7 * * * *',
--   'select public.geomacro_purge_risk_buffer_7d()');
-- Never run this in the existing GeoMacro production database.
