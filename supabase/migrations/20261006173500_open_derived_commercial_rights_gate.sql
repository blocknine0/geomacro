begin;

-- Geomacro commercial delivery is derived intelligence only. Raw upstream
-- payloads remain internal and are never redistributed to customers.
--
-- This migration opens the RIGHTS/POLICY gate only for sources whose current
-- public terms support Geomacro's derived-intelligence boundary. Technical
-- production activation remains fail-closed on the full certification record.

-- IEA Critical Minerals Dataset 2026: CC BY 4.0, attribution required.
update public.live_external_sources
set
  commercial_usage_status = 'COMMERCIAL_OK',
  licence_name = 'CC BY 4.0',
  raw_redistribution_allowed = false,
  attribution_required = true,
  updated_at = now(),
  notes = 'Commercial derived-intelligence rights approved for the IEA Critical Minerals Dataset 2026 under CC BY 4.0. Raw source payload redistribution remains disabled. Commercial signal activation still requires full source certification and runtime proof.'
where source_id = 'iea_critical_minerals_2026_dataset';

update public.live_source_certification_records
set
  rights_status = 'COMMERCIAL_OK',
  rights_evidence_ref = 'https://www.iea.org/data-and-statistics/data-product/critical-minerals-dataset',
  rights_reviewed_at = now(),
  updated_at = now()
where source_id = 'iea_critical_minerals_2026_dataset';

-- EIA data/files/databases are U.S. Government public-domain information.
update public.live_external_sources
set
  commercial_usage_status = 'COMMERCIAL_OK',
  raw_redistribution_allowed = false,
  attribution_required = true,
  updated_at = now(),
  notes = 'Commercial derived-intelligence rights approved for EIA public-domain data with source acknowledgement. Raw source payload redistribution remains disabled. Commercial signal activation still requires full source certification and runtime proof.'
where source_id = 'eia_api_v2';

update public.live_source_certification_records
set
  rights_status = 'COMMERCIAL_OK',
  rights_evidence_ref = 'https://www.eia.gov/about/copyrights_reuse.php',
  rights_reviewed_at = now(),
  updated_at = now()
where source_id = 'eia_api_v2';

-- GDACS is already governed by the reviewed realtime-source policy as
-- DERIVED_ONLY. Align the external-source registry with that exact boundary.
update public.live_external_sources
set
  commercial_usage_status = 'DERIVED_ONLY',
  raw_redistribution_allowed = false,
  attribution_required = true,
  enabled_for_ingestion = true,
  updated_at = now(),
  notes = 'GDACS is approved only as an internal near-real-time disaster input to Geomacro-derived intelligence. No raw alert/source redistribution. Automatic GDACS estimates require corroboration and never replace official authority alerts. Commercial signal activation still requires full source certification and runtime proof.'
where source_id = 'gdacs_global_disasters';

update public.live_source_certification_records
set
  rights_status = 'DERIVED_ONLY',
  rights_evidence_ref = 'https://www.gdacs.org/About/termofuse.aspx',
  rights_reviewed_at = now(),
  updated_at = now()
where source_id = 'gdacs_global_disasters';

-- Rights approval is not technical certification. Activate commercial signals
-- only when every production gate is already proven on the exact source.
update public.live_external_sources as src
set
  enabled_for_commercial_signals = src.enabled_for_ingestion = true and exists (
    select 1
    from public.live_source_certification_records cert
    where cert.source_id = src.source_id
      and cert.certification_state = 'CERTIFIED'
      and cert.endpoint_status = 'PASS'
      and cert.rights_status in ('COMMERCIAL_OK','DERIVED_ONLY')
      and cert.schema_status in ('PASS','NOT_APPLICABLE')
      and cert.freshness_status in ('FRESH','VARIABLE','NOT_APPLICABLE')
      and cert.provenance_status in ('PASS','NOT_APPLICABLE')
      and cert.independence_status in ('PASS','NOT_APPLICABLE')
      and cert.adapter_status in ('TESTED','NOT_APPLICABLE')
      and cert.runtime_status in ('PASS','NOT_APPLICABLE')
      and cert.fallback_status in ('READY','NOT_REQUIRED')
  ),
  updated_at = now()
where src.source_id in (
  'iea_critical_minerals_2026_dataset',
  'eia_api_v2',
  'gdacs_global_disasters'
);

-- Sources whose current terms still require explicit permission/review remain
-- fail-closed even though Geomacro never redistributes raw source payloads.
update public.live_external_sources
set enabled_for_commercial_signals = false,
    raw_redistribution_allowed = false,
    updated_at = now()
where source_id in (
  'un_comtrade',
  'un_comtrade_api',
  'wto_timeseries',
  'wto_critical_minerals_dataset',
  'reliefweb',
  'reliefweb_reports_api'
);

commit;
