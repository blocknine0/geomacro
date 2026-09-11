begin;

-- UCDP Candidate is the current/monthly evidence lane for the main Geomacro
-- product database. Finalized historical UCDP releases remain in the separate
-- geomacro-historical-data warehouse.
--
-- Candidate rows are evidence-only. They must not silently change the frozen
-- GRI/GRO methodology. Revisions are preserved as immutable normalized hashes;
-- the serving view below selects the newest release for each UCDP event id.

insert into public.live_external_sources (
  source_id,
  source_name,
  provider_name,
  category,
  access_type,
  authentication_type,
  base_url,
  licence_name,
  commercial_usage_status,
  raw_redistribution_allowed,
  attribution_required,
  enabled_for_ingestion,
  enabled_for_commercial_signals,
  country_scope,
  freshness_class,
  notes
)
values (
  'ucdp_candidate',
  'UCDP Candidate Events Dataset',
  'Uppsala Conflict Data Program',
  'GEOPOLITICS',
  'API',
  'API_TOKEN',
  'https://ucdpapi.pcr.uu.se/api/gedevents/',
  'CC BY 4.0',
  'COMMERCIAL_OK',
  true,
  true,
  true,
  true,
  'GLOBAL',
  'MONTHLY',
  'Authenticated current/monthly UCDP Candidate evidence. Evidence-only; not part of frozen GRI/GRO scoring unless a separately versioned methodology activates it.'
)
on conflict (source_id)
do update set
  source_name = excluded.source_name,
  provider_name = excluded.provider_name,
  category = excluded.category,
  access_type = excluded.access_type,
  authentication_type = excluded.authentication_type,
  base_url = excluded.base_url,
  licence_name = excluded.licence_name,
  commercial_usage_status = excluded.commercial_usage_status,
  raw_redistribution_allowed = excluded.raw_redistribution_allowed,
  attribution_required = excluded.attribution_required,
  enabled_for_ingestion = excluded.enabled_for_ingestion,
  enabled_for_commercial_signals = excluded.enabled_for_commercial_signals,
  country_scope = excluded.country_scope,
  freshness_class = excluded.freshness_class,
  notes = excluded.notes,
  updated_at = now();

create index if not exists
  live_external_observations_ucdp_candidate_revision_idx
on public.live_external_observations (
  source_id,
  source_record_id,
  ingested_at desc
)
where source_id = 'ucdp_candidate';

create or replace view public.live_ucdp_candidate_latest
with (security_invoker = true)
as
select distinct on (o.source_record_id)
  o.*
from public.live_external_observations o
where o.source_id = 'ucdp_candidate'
order by
  o.source_record_id,
  case
    when coalesce(o.provenance ->> 'release_rank', '') ~ '^[0-9]+$'
      then (o.provenance ->> 'release_rank')::bigint
    else 0
  end desc,
  o.ingested_at desc,
  o.normalized_hash desc;

revoke all on public.live_ucdp_candidate_latest
  from public, anon, authenticated;
grant select on public.live_ucdp_candidate_latest
  to service_role;

comment on view public.live_ucdp_candidate_latest is
  'Latest governed UCDP Candidate revision per UCDP event id. Historical/finalized UCDP data remains in the separate historical warehouse.';

commit;
