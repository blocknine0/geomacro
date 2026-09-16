begin;

-- Align runtime source-rights flags with the reviewed commercial-rights evidence
-- manifest. This migration is intentionally narrow and does not enable new
-- ingestion, payment, marketplace, or execution paths.
--
-- world_bank_wgi_political_stability
--   Reviewed WGI output contract is CC BY 4.0 and permits redistribution of the
--   World Bank-published WGI output with attribution. This does NOT extend to
--   separately identifiable proprietary upstream perception-source material.
--
-- usgs_mcs
--   Keep raw redistribution disabled at the product boundary. USGS-authored
--   data are generally public domain, but the reviewed Geomacro contract for
--   Mineral Commodity Summaries is deliberately derived-intelligence-only so
--   third-party material can never be swept into a paid raw-evidence response.

do $$
begin
  if not exists (
    select 1
    from public.live_external_sources
    where source_id = 'world_bank_wgi_political_stability'
      and commercial_usage_status = 'COMMERCIAL_OK'
      and attribution_required = true
      and enabled_for_ingestion = true
  ) then
    raise exception 'world_bank_wgi_political_stability runtime contract is missing or unexpectedly changed';
  end if;

  if not exists (
    select 1
    from public.live_external_sources
    where source_id = 'usgs_mcs'
      and commercial_usage_status = 'COMMERCIAL_OK'
      and attribution_required = true
      and enabled_for_ingestion = true
  ) then
    raise exception 'usgs_mcs runtime contract is missing or unexpectedly changed';
  end if;
end
$$;

update public.live_external_sources
set
  raw_redistribution_allowed = true,
  notes = 'WGI 2025 Revision World Bank-published political-stability output is CC BY 4.0 and may be redistributed with attribution. This approval never extends to separately identifiable proprietary upstream perception-source material.',
  updated_at = now()
where source_id = 'world_bank_wgi_political_stability';

update public.live_external_sources
set
  raw_redistribution_allowed = false,
  notes = 'Paid delivery remains derived-intelligence-only for Mineral Commodity Summaries. Preserve USGS provenance/credit and never treat non-USGS photographs, illustrations, graphics, or other third-party material as redistributable source data.',
  updated_at = now()
where source_id = 'usgs_mcs';

do $$
begin
  if not exists (
    select 1
    from public.live_external_sources
    where source_id = 'world_bank_wgi_political_stability'
      and raw_redistribution_allowed = true
      and attribution_required = true
  ) then
    raise exception 'world_bank_wgi_political_stability rights parity update failed';
  end if;

  if not exists (
    select 1
    from public.live_external_sources
    where source_id = 'usgs_mcs'
      and raw_redistribution_allowed = false
      and attribution_required = true
  ) then
    raise exception 'usgs_mcs rights parity update failed';
  end if;
end
$$;

commit;
