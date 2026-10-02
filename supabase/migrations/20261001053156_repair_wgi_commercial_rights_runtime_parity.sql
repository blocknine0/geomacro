begin;

-- Repair runtime drift back to the already reviewed WGI commercial-rights contract.
-- This does not enable a source, change ingestion/commercial-signal state, activate
-- payments, or broaden the approved dataset boundary. It restores only the WGI
-- raw-redistribution flag and reviewed notes previously locked by migration 936
-- and scripts/commercial-source-rights-evidence.mjs.
do $$
begin
  if not exists (
    select 1
    from public.live_external_sources
    where source_id = 'world_bank_wgi_political_stability'
      and commercial_usage_status = 'COMMERCIAL_OK'
      and attribution_required = true
  ) then
    raise exception 'world_bank_wgi_political_stability rights contract is missing or unexpectedly changed';
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
  ) then
    raise exception 'world_bank_wgi_political_stability rights parity repair failed';
  end if;
end
$$;

commit;
