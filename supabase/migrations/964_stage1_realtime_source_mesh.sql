begin;

-- Stage 1 real-time source mesh.
-- Raw third-party evidence remains private. Only derived structured intelligence
-- is eligible for customer delivery.

insert into public.live_source_registry (
  source_key,
  source_name,
  provider,
  source_type,
  base_url,
  enabled,
  cadence_seconds,
  raw_storage_policy,
  redistribution_allowed,
  derivative_intelligence_allowed,
  attribution_required,
  license_url,
  notes,
  commercial_usage_status,
  commercial_terms_reference,
  commercial_reviewed_at
)
values
(
  'usgs_earthquakes',
  'USGS Earthquake Real-Time GeoJSON',
  'U.S. Geological Survey',
  'official_government',
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson',
  true,
  60,
  'internal_only',
  false,
  true,
  true,
  'https://www.usgs.gov/data-management/data-licensing',
  'Real-time earthquake feed updated every minute. Geomacro stores only normalized internal evidence and derives structured risk intelligence.',
  'COMMERCIAL_OK',
  'https://www.usgs.gov/data-management/data-licensing',
  '2026-09-21T00:00:00Z'::timestamptz
),
(
  'gdacs_global_disasters',
  'GDACS Global Disaster Alerts',
  'Global Disaster Alert and Coordination System',
  'international_org',
  'https://www.gdacs.org/gdacsapi/swagger/index.html',
  true,
  360,
  'internal_only',
  false,
  true,
  true,
  'https://www.gdacs.org/About/termofuse.aspx',
  'Near-real-time global disaster alerts. Geomacro uses GDACS only as an internal derived-intelligence input and does not redistribute raw alerts or source material.',
  'DERIVED_ONLY',
  'https://www.gdacs.org/About/termofuse.aspx',
  '2026-09-21T00:00:00Z'::timestamptz
),
(
  'reliefweb_reports',
  'ReliefWeb Latest Reports',
  'UN OCHA ReliefWeb',
  'international_org',
  'https://api.reliefweb.int/v2/reports',
  true,
  300,
  'internal_only',
  false,
  true,
  true,
  'https://apidoc.reliefweb.int/',
  'Continuously updated humanitarian reports. API access requires an approved appname; underlying reports may contain third-party copyrighted material, so commercial reuse remains review-gated.',
  'REVIEW_REQUIRED',
  'https://apidoc.reliefweb.int/',
  '2026-09-21T00:00:00Z'::timestamptz
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
  updated_at = now();

alter table public.live_source_registry
  add column if not exists realtime_hot_topic_enabled boolean not null default false;

update public.live_source_registry
set realtime_hot_topic_enabled = case
  when source_key = 'gdelt_gal' then true
  when source_key in ('usgs_earthquakes', 'gdacs_global_disasters') then true
  else false
end
where source_key in (
  'gdelt_gal',
  'usgs_earthquakes',
  'gdacs_global_disasters',
  'reliefweb_reports'
);


commit;
