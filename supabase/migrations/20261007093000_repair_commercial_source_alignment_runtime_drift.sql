-- #1414 current-production source-governance drift repair
--
-- Keep uncertified runtime sources fail-closed without inventing certification
-- evidence, and make the default-off Telegram bridge inventory explicit.
-- Telegram remains supplementary UNVERIFIED lead evidence only.

begin;

-- GDACS currently has reviewed DERIVED_ONLY rights but its technical
-- certification/runtime evidence is incomplete. Do not leave an untested source
-- active for ingestion merely because rights were reviewed.
update public.live_external_sources s
set
  enabled_for_ingestion = false,
  enabled_for_commercial_signals = false,
  updated_at = now(),
  notes = coalesce(s.notes, '') ||
    ' #1414 runtime guard: ingestion remains disabled while the source lacks the full certified technical/runtime contract.'
where s.source_id = 'gdacs_global_disasters'
  and not exists (
    select 1
    from public.live_source_certification_records cert
    where cert.source_id = s.source_id
      and cert.certification_state = 'CERTIFIED'
      and cert.endpoint_status = 'PASS'
      and cert.rights_status in ('COMMERCIAL_OK', 'DERIVED_ONLY')
      and cert.schema_status in ('PASS', 'NOT_APPLICABLE')
      and cert.freshness_status in ('FRESH', 'VARIABLE', 'NOT_APPLICABLE')
      and cert.provenance_status in ('PASS', 'NOT_APPLICABLE')
      and cert.independence_status in ('PASS', 'NOT_APPLICABLE')
      and cert.adapter_status in ('TESTED', 'NOT_APPLICABLE')
      and cert.runtime_status in ('PASS', 'NOT_APPLICABLE')
      and cert.fallback_status in ('READY', 'NOT_REQUIRED')
  );

-- The authorized Telegram lane is a governed B2/D1 bridge, not a public
-- Telegram scrape endpoint. Record that transport explicitly without enabling
-- any publisher, ingestion, or commercial signal.
update public.live_external_sources
set
  base_url = 'b2://geomacro-private-archive/telegram/leads/',
  access_type = 'MIXED',
  authentication_type = 'SIGNED_ENVELOPE_PROTOCOL_HASH',
  commercial_usage_status = 'REVIEW_REQUIRED',
  raw_redistribution_allowed = false,
  enabled_for_ingestion = false,
  enabled_for_commercial_signals = false,
  notes = 'Default-off governed Telegram lead bridge: geomacro-telegram-signals publishes compact UNVERIFIED envelopes to B2 with D1 checkpoint/index state. Per-publisher authorization plus independent non-Telegram corroboration and normal rights/provenance/freshness gates are mandatory before downstream promotion. Raw Telegram content is never customer-facing.',
  updated_at = now()
where source_id = 'telegram_authorized_publisher_feed';

-- Discovery is not authorization. Move the disabled generic bridge out of
-- implicit NOT_STARTED/UNREVIEWED state only into explicit fail-closed review.
update public.live_source_certification_records cert
set
  certification_state = case
    when cert.certification_state = 'NOT_STARTED' then 'IN_REVIEW'
    else cert.certification_state
  end,
  rights_status = case
    when cert.rights_status = 'UNREVIEWED' then 'REVIEW_REQUIRED'
    else cert.rights_status
  end,
  certification_reason = case
    when cert.certification_state = 'NOT_STARTED'
      then 'Governed Telegram bridge is explicitly quarantined pending publisher authorization and source certification; discovery never authorizes ingestion.'
    else cert.certification_reason
  end,
  updated_at = now()
from public.live_external_sources s
where cert.source_id = 'telegram_authorized_publisher_feed'
  and s.source_id = cert.source_id
  and s.enabled_for_ingestion = false
  and s.enabled_for_commercial_signals = false;

-- This canonical migration must replay from zero without relying on
-- production-history-only Telegram helper functions. It therefore leaves the
-- generic bridge fail-closed here. Current production's existing authorization
-- trigger may later re-evaluate ingestion only after a separate publisher
-- authorization contract succeeds; this migration itself never authorizes it.

commit;
