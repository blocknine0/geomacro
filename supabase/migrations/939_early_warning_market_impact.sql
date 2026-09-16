-- =============================================================================
-- Geomacro Early Warning structural market-impact extension
--
-- PURPOSE
-- - persist the deterministic categorical cross-asset transmission assessment
-- - bind the assessment to an explicit provisional methodology version + hash
-- - keep published alert market-impact fields immutable
--
-- IMPORTANT
-- - this is structural pressure only, not a market-price forecast
-- - methodology remains uncalibrated
-- - no BUY/SELL, price target, execution or public performance claim is enabled
-- =============================================================================

alter table public.early_warning_alerts
  add column if not exists market_impact jsonb,
  add column if not exists market_impact_methodology_version text,
  add column if not exists market_impact_calibrated boolean not null default false,
  add column if not exists market_impact_hash text;

alter table public.early_warning_alerts
  drop constraint if exists early_warning_market_impact_object_check,
  add constraint early_warning_market_impact_object_check
    check (market_impact is null or jsonb_typeof(market_impact) = 'object'),
  drop constraint if exists early_warning_market_impact_binding_check,
  add constraint early_warning_market_impact_binding_check
    check (
      (
        market_impact is null
        and market_impact_methodology_version is null
        and market_impact_hash is null
        and market_impact_calibrated is false
      )
      or
      (
        market_impact is not null
        and market_impact_methodology_version = 'early-warning-market-impact-v0.1-provisional'
        and market_impact_hash ~ '^[0-9a-f]{64}$'
        and market_impact_calibrated is false
      )
    );

comment on column public.early_warning_alerts.market_impact is
  'Deterministic categorical structural cross-asset pressure map. Not a price forecast or trading instruction.';
comment on column public.early_warning_alerts.market_impact_methodology_version is
  'Version of the structural market-impact mapping used for this timestamped alert.';
comment on column public.early_warning_alerts.market_impact_calibrated is
  'False for provisional v0.1. Must not be interpreted as historical market-impact calibration.';
comment on column public.early_warning_alerts.market_impact_hash is
  'SHA-256 of the canonical market_impact object used for idempotency and audit binding.';

create or replace function public.guard_published_early_warning_core()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.published_at_utc is not null and (
    new.alert_key is distinct from old.alert_key or
    new.country_iso3 is distinct from old.country_iso3 or
    new.country_name is distinct from old.country_name or
    new.country_timezone is distinct from old.country_timezone or
    new.event_family is distinct from old.event_family or
    new.event_title is distinct from old.event_title or
    new.primary_cause is distinct from old.primary_cause or
    new.status is distinct from old.status or
    new.cews_score is distinct from old.cews_score or
    new.cews_inputs is distinct from old.cews_inputs or
    new.cews_contributions is distinct from old.cews_contributions or
    new.confidence is distinct from old.confidence or
    new.independent_evidence_count is distinct from old.independent_evidence_count or
    new.official_source_present is distinct from old.official_source_present or
    new.evidence_refs is distinct from old.evidence_refs or
    new.transmission_channels is distinct from old.transmission_channels or
    new.market_relevance is distinct from old.market_relevance or
    new.market_impact is distinct from old.market_impact or
    new.market_impact_methodology_version is distinct from old.market_impact_methodology_version or
    new.market_impact_calibrated is distinct from old.market_impact_calibrated or
    new.market_impact_hash is distinct from old.market_impact_hash or
    new.detected_at_utc is distinct from old.detected_at_utc or
    new.detected_at_local is distinct from old.detected_at_local or
    new.evidence_hash is distinct from old.evidence_hash or
    new.calculation_hash is distinct from old.calculation_hash or
    new.methodology_version is distinct from old.methodology_version
  ) then
    raise exception 'published early warning core fields are immutable; append a new alert instead';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.guard_published_early_warning_core() from PUBLIC, anon, authenticated;
grant execute on function public.guard_published_early_warning_core() to service_role;
