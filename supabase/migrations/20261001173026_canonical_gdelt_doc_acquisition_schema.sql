begin;

insert into public.live_source_registry (
  source_key, source_name, provider, source_type, base_url, enabled,
  cadence_seconds, raw_storage_policy, redistribution_allowed,
  derivative_intelligence_allowed, attribution_required, license_url, notes,
  commercial_usage_status, commercial_terms_reference, commercial_reviewed_at,
  realtime_hot_topic_enabled, connector_status
)
values (
  'gdelt_doc', 'GDELT DOC 2.0 API', 'GDELT', 'news_discovery',
  'https://api.gdeltproject.org/api/v2/doc/doc', true, 900,
  'internal_only', false, true, true,
  'https://www.gdeltproject.org/about.html',
  'GDELT DOC is discovery metadata only. Geomacro distributes derived intelligence, not raw third-party publisher content.',
  'DERIVED_ONLY', 'https://www.gdeltproject.org/about.html',
  '2026-10-01T00:00:00Z'::timestamptz, true, 'registered'
)
on conflict (source_key) do update set
  source_name = excluded.source_name,
  provider = excluded.provider,
  source_type = excluded.source_type,
  base_url = excluded.base_url,
  enabled = excluded.enabled,
  cadence_seconds = excluded.cadence_seconds,
  raw_storage_policy = excluded.raw_storage_policy,
  redistribution_allowed = excluded.redistribution_allowed,
  derivative_intelligence_allowed = excluded.derivative_intelligence_allowed,
  attribution_required = excluded.attribution_required,
  license_url = excluded.license_url,
  notes = excluded.notes,
  commercial_usage_status = excluded.commercial_usage_status,
  commercial_terms_reference = excluded.commercial_terms_reference,
  commercial_reviewed_at = excluded.commercial_reviewed_at,
  realtime_hot_topic_enabled = excluded.realtime_hot_topic_enabled,
  connector_status = excluded.connector_status,
  updated_at = now();

alter table public.live_structured_event_evidence
  add column if not exists acquisition_source_key text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'live_structured_event_evidence_acquisition_source_key_fkey'
  ) then
    alter table public.live_structured_event_evidence
      add constraint live_structured_event_evidence_acquisition_source_key_fkey
      foreign key (acquisition_source_key)
      references public.live_source_registry(source_key)
      on update cascade on delete restrict;
  end if;
end $$;

create index if not exists live_structured_event_evidence_acquisition_source_event_idx
  on public.live_structured_event_evidence(acquisition_source_key, event_id)
  where acquisition_source_key is not null;

create table if not exists public.live_source_discovery_fingerprints (
  fingerprint text not null,
  source_key text not null references public.live_source_registry(source_key)
    on update cascade on delete restrict,
  observed_at timestamptz not null,
  expires_at timestamptz not null,
  source_domain text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (fingerprint, source_key),
  check (fingerprint ~ '^[a-f0-9]{64}$'),
  check (expires_at > observed_at)
);

alter table public.live_source_discovery_fingerprints enable row level security;
revoke all on public.live_source_discovery_fingerprints from public, anon, authenticated;
grant select, insert, update, delete on public.live_source_discovery_fingerprints to service_role;

create index if not exists live_source_discovery_fingerprints_expiry_idx
  on public.live_source_discovery_fingerprints(expires_at, source_key);

commit;
