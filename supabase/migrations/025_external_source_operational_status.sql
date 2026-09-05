-- =============================================================================
-- Geomacro external source operational-status hardening.
--
-- Commercial eligibility and operational ingestion readiness are separate.
-- A commercially reusable dataset must not be marked ingestion-ready until
-- its automated adapter has a verified machine-readable path.
-- =============================================================================

update public.live_external_sources
set
  enabled_for_ingestion = false,
  enabled_for_commercial_signals = false,
  notes =
    coalesce(notes, '') ||
    ' Automated ingestion disabled: current Data360 discovery endpoint requires adapter/API contract correction.',
  updated_at = now()
where source_id =
  'world_bank_data360';


update public.live_external_sources
set
  enabled_for_ingestion = false,
  enabled_for_commercial_signals = false,
  notes =
    coalesce(notes, '') ||
    ' Automated ingestion disabled: direct current dataset access returned HTTP 403. Manual/account-backed integration may be implemented separately.',
  updated_at = now()
where source_id =
  'iea_critical_minerals';


update public.live_external_sources
set
  enabled_for_ingestion = false,
  enabled_for_commercial_signals = false,
  notes =
    coalesce(notes, '') ||
    ' Automated ingestion disabled until a stable machine-readable dataset asset is explicitly identified and mapped.',
  updated_at = now()
where source_id =
  'jrc_rmis_supply_chain';


-- These adapters have completed real-data ingestion tests.

update public.live_external_sources
set
  enabled_for_ingestion = true,
  enabled_for_commercial_signals = true,
  updated_at = now()
where source_id in (
  'world_bank_indicators',
  'unhcr_refugee_statistics',
  'usgs_mcs'
);
