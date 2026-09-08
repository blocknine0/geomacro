begin;

-- The original registry represented external acquisition sources only.
-- Geomacro now also needs an explicit internal producer identity for the
-- admitted-event -> structured-intelligence handoff.
--
-- This does NOT grant, alter, or override any underlying source rights.

alter table public.live_source_registry
  drop constraint if exists live_source_registry_source_type_check;

alter table public.live_source_registry
  add constraint live_source_registry_source_type_check
  check (
    source_type in (
      'news_discovery',
      'official_government',
      'central_bank',
      'statistics_office',
      'international_org',
      'trade',
      'critical_minerals',
      'calendar',
      'internal_derived'
    )
  );

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
  notes
)
values (
  'admitted_events',
  'Geomacro Admitted Event Handoff',
  'Geomacro',
  'internal_derived',
  'https://geomacro.live',
  true,
  7200,
  'internal_only',
  false,
  true,
  true,
  null,
  'Internal producer that exports already-admitted public.events into the shared structured-intelligence evidence-fragment contract. It is not an external publisher and does not grant or override underlying source licence, redistribution, attribution, provenance, or commercial-eligibility status. Customer-facing products consume downstream Geomacro structured intelligence only.'
)
on conflict (source_key)
do update set
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
  updated_at = now();

commit;
