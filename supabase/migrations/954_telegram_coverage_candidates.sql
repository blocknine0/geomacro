-- =============================================================================
-- Geomacro Telegram candidate sources for broader three-category coverage
--
-- These rows are candidates only. Migration 946/production governance requires
-- explicit manual review + APPROVED status + enabled=true before ingestion.
-- They remain INTERNAL_RESEARCH_ONLY and do not authorize raw redistribution.
-- =============================================================================

insert into public.live_telegram_channel_registry (
  channel_key,
  display_name,
  official_status,
  rights_status,
  source_reliability,
  domains,
  enabled,
  notes
)
values
(
  'bricsnews',
  'BRICS News',
  'UNVERIFIED_OWNERSHIP',
  'INTERNAL_RESEARCH_ONLY',
  35,
  array['GEOPOLITICS', 'MACRO', 'CRITICAL_MINERALS'],
  false,
  'Fast global relay candidate. Public channel currently carries geopolitical and macro headlines and occasional critical-minerals/rare-earth updates. Use only as a low-trust lead source pending manual approval and independent corroboration.'
),
(
  'uztmk_official',
  'OʻzTMK Press-service',
  'OFFICIAL',
  'INTERNAL_RESEARCH_ONLY',
  80,
  array['CRITICAL_MINERALS', 'MACRO'],
  false,
  'Official press-service channel of Uzbekistan Technological Metals Complex. Useful as a regional critical-minerals industry signal; scope is not global, so keep it supplementary and require independent confirmation for broader claims.'
)
on conflict (channel_key)
do update set
  display_name = excluded.display_name,
  official_status = excluded.official_status,
  rights_status = excluded.rights_status,
  source_reliability = excluded.source_reliability,
  domains = excluded.domains,
  enabled = false,
  notes = excluded.notes,
  updated_at = now();
