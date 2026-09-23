-- =============================================================================
-- Commercial source certification fail-closed hardening.
--
-- These sources may remain available for runtime/derived intelligence where
-- appropriate, but they must not be enabled as commercial signal inputs until
-- endpoint, rights, provenance, adapter, runtime, and fallback certification
-- has completed.
-- =============================================================================

update public.live_external_sources
set
  enabled_for_commercial_signals = false,
  notes = coalesce(notes, '') ||
    ' Commercial signals disabled fail-closed until source certification is complete.',
  updated_at = now()
where source_id in (
  'world_bank_indicators',
  'unhcr_refugee_statistics',
  'usgs_mcs',
  'ucdp_candidate',
  'world_bank_qpsd',
  'world_bank_wgi_political_stability',
  'eurostat_government_finance'
);
