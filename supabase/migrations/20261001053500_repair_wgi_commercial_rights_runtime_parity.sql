begin;

-- Repair runtime drift back to the already reviewed commercial-rights contract.
-- This does not enable a new source, new ingestion path, payment rail, or broader
-- rights boundary. It only restores the WGI flag and notes previously locked by
-- migration 936 and scripts/commercial-source-rights-evidence.mjs.
do $$
begin
  if not exists (
    select 1
    from public.live_external_sources
    where source_id = 'world_bank_wgi_political_stability'
      and commercial_usage_status = 'COMMERCIAL_OK'
      and attribution_required = true
      and enabled_for_ingestion = true
      and enabled_for_commercial_signals = true
  ) then
    raise exception 'world_bank_wgi_political_stability runtime contract is missing or unexpectedly changed';
  end if;
end
$$;

update public.live_external_sources
set
  raw_redistribution_allowed = true,
  notes = 'WGI 2025 Revision World Bank-published political-stability output is CC BY 4.0 and may be redistributed with attribution. This approval never extends to separately identifiable proprietary upstream perception-source material.',
  updated_at = now()
where source_id = 'world_bank_wgi_political_stability'
  and (
    raw_redistribution_allowed is distinct from true
    or notes is distinct from 'WGI 2025 Revision World Bank-published political-stability output is CC BY 4.0 and may be redistributed with attribution. This approval never extends to separately identifiable proprietary upstream perception-source material.'
  );

do $$
begin
  if not exists (
    select 1
    from public.live_external_sources
    where source_id = 'world_bank_wgi_political_stability'
      and commercial_usage_status = 'COMMERCIAL_OK'
      and raw_redistribution_allowed = true
      and attribution_required = true
      and enabled_for_ingestion = true
      and enabled_for_commercial_signals = true
  ) then
    raise exception 'world_bank_wgi_political_stability rights parity repair failed';
  end if;

  if not exists (
    select 1
    from public.live_external_sources
    where source_id = 'usgs_mcs'
      and commercial_usage_status = 'COMMERCIAL_OK'
      and raw_redistribution_allowed = false
      and attribution_required = true
      and enabled_for_ingestion = true
      and enabled_for_commercial_signals = true
  ) then
    raise exception 'usgs_mcs reviewed rights boundary unexpectedly changed';
  end if;
end
$$;

commit;
