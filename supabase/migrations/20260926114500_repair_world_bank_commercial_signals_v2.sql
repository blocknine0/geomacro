begin;

-- Production audit 36239372686 on 2026-09-26 proved that the reviewed
-- world_bank_indicators registry row is still COMMERCIAL_OK and ingestion-enabled,
-- but enabled_for_commercial_signals is false in the live production database.
--
-- The earlier 979 repair file did not change production because that short
-- migration version was already present in the remote migration history, so the
-- SQL was treated as already applied. Use a timestamped, collision-resistant
-- migration version for the actual governed repair.
--
-- This migration does NOT grant or broaden commercial rights, does NOT change
-- raw redistribution policy, and does NOT enable ingestion for an unreviewed
-- source. It only restores the operational flag when the reviewed preconditions
-- are still true. Otherwise it fails closed.
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
      'world_bank_indicators is not an ingestion-enabled COMMERCIAL_OK source; refusing commercial-signal repair v2';
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
      'world_bank_indicators commercial-signal repair v2 did not reach the governed operational state';
  end if;
end
$$;

commit;
