begin;

-- Production readiness audit 2026-09-26 confirmed the reviewed World Bank WDI
-- registry row remains COMMERCIAL_OK and ingestion-enabled, but the operational
-- commercial-signal flag drifted to false. Country macro/fiscal scoring already
-- fails closed when that flag is false, so restore only this operational bit.
--
-- This migration does NOT create or upgrade commercial rights, does NOT alter
-- raw redistribution policy, and does NOT enable ingestion for an unreviewed
-- source. If the reviewed preconditions are no longer true, abort instead.
do $$
begin
  if not exists (
    select 1
    from public.live_external_sources
    where source_id = 'world_bank_indicators'
      and commercial_usage_status = 'COMMERCIAL_OK'
      and enabled_for_ingestion = true
  ) then
    raise exception
      'world_bank_indicators is not an ingestion-enabled COMMERCIAL_OK source; refusing commercial-signal repair';
  end if;
end
$$;

update public.live_external_sources
set
  enabled_for_commercial_signals = true,
  updated_at = now()
where source_id = 'world_bank_indicators'
  and commercial_usage_status = 'COMMERCIAL_OK'
  and enabled_for_ingestion = true
  and enabled_for_commercial_signals is distinct from true;

do $$
begin
  if not exists (
    select 1
    from public.live_external_sources
    where source_id = 'world_bank_indicators'
      and commercial_usage_status = 'COMMERCIAL_OK'
      and enabled_for_ingestion = true
      and enabled_for_commercial_signals = true
  ) then
    raise exception
      'world_bank_indicators commercial-signal repair did not reach the governed operational state';
  end if;
end
$$;

commit;
