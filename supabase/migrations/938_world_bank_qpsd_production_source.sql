begin;

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
  'world_bank_qpsd',
  'Quarterly Public Sector Debt (QPSD)',
  'World Bank',
  'MACRO',
  'BULK_DOWNLOAD',
  'NONE',
  'https://databank.worldbank.org/data/download/QPSD_CSV.zip',
  'CC BY 4.0',
  'COMMERCIAL_OK',
  false,
  true,
  true,
  false,
  'GLOBAL',
  'QUARTERLY',
  'Exact QPSD Data Catalog dataset 0037906 / DataBank source 3009 only. Rights are reviewed and ingestion may be prepared, but commercial signal activation remains disabled until the source-specific methodology, authoritative registry mapping and full production country census pass. General-government and central-government debt remain distinct concepts; no raw pooling or blanket bulk redistribution.'
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

create or replace view public.live_world_bank_qpsd_latest
with (security_invoker = true)
as
select distinct on (
  o.country_iso3,
  o.metric
)
  o.observation_id,
  o.source_id,
  o.country_iso3,
  o.metric,
  o.value_numeric,
  o.unit,
  o.observed_at,
  o.published_at,
  o.normalized_hash,
  o.ingested_at,
  o.provenance,
  o.quality_status,
  o.commercial_eligibility_status
from public.live_external_observations o
join public.live_external_sources s
  on s.source_id = o.source_id
where
  o.source_id = 'world_bank_qpsd'
  and o.country_iso3 is not null
  and o.metric in (
    'qpsd_general_government_gross_debt_pct_gdp',
    'qpsd_central_government_gross_debt_pct_gdp'
  )
  and o.quality_status = 'VERIFIED'
  and o.commercial_eligibility_status = 'VERIFIED'
  and s.commercial_usage_status = 'COMMERCIAL_OK'
  and s.enabled_for_ingestion = true
  and s.enabled_for_commercial_signals = true
order by
  o.country_iso3,
  o.metric,
  o.observed_at desc nulls last,
  o.ingested_at desc,
  o.normalized_hash desc;

comment on view public.live_world_bank_qpsd_latest is
  'Latest governed commercially eligible QPSD observations per country and source-specific government-sector metric. The view remains empty while live_external_sources.enabled_for_commercial_signals=false; activation requires an explicit later promotion after census evidence. General-government and central-government values are not pooled.';

revoke all on public.live_world_bank_qpsd_latest
  from public, anon, authenticated;
grant select on public.live_world_bank_qpsd_latest
  to service_role;

commit;
