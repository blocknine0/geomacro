-- Geomacro paid structured-output source activation.
--
-- Commercial customers receive Geomacro-derived structured intelligence only.
-- This migration does NOT authorize raw redistribution and does NOT promote any
-- uncertified source. It activates only the three already-certified launch
-- sources needed to cover Geopolitics, Macro, and Critical Minerals.
--
-- Canonical zero-replay deliberately has no runtime certification evidence. In
-- that one state this data migration is a no-op. A populated certification
-- registry is treated as production/runtime state and must pass every gate.

do $$
declare
  v_registry_count integer;
  v_target_source_count integer;
  v_certified_count integer;
  v_enabled_count integer;
begin
  select count(*)::integer
    into v_registry_count
  from public.live_source_certification_records;

  if v_registry_count = 0 then
    raise notice 'PAID_OUTPUT_SOURCE_ACTIVATION_ZERO_REPLAY_NOOP';
    return;
  end if;

  select count(*)::integer
    into v_target_source_count
  from public.live_external_sources
  where source_id in ('gdelt_v2_events', 'world_bank_indicators', 'usgs_mcs');

  if v_target_source_count <> 3 then
    raise exception 'PAID_OUTPUT_SOURCE_ACTIVATION_REQUIRES_THREE_REGISTERED_SOURCES: %', v_target_source_count;
  end if;

  select count(*)::integer
    into v_certified_count
  from public.live_source_certification_records c
  join public.live_external_sources s using (source_id)
  where c.source_id in ('gdelt_v2_events', 'world_bank_indicators', 'usgs_mcs')
    and c.certification_state = 'CERTIFIED'
    and c.rights_status in ('COMMERCIAL_OK', 'DERIVED_ONLY')
    and s.commercial_usage_status in ('COMMERCIAL_OK', 'DERIVED_ONLY')
    and s.enabled_for_ingestion = true;

  if v_certified_count <> 3 then
    raise exception 'PAID_OUTPUT_SOURCE_ACTIVATION_REQUIRES_THREE_CERTIFIED_SOURCES: %', v_certified_count;
  end if;

  update public.live_external_sources
  set
    enabled_for_commercial_signals = true,
    notes = case source_id
      when 'gdelt_v2_events' then
        'Commercial paid-output eligible for Geomacro-derived geopolitical signals. Customer delivery remains structured derived intelligence only; upstream publisher article text/media, source URLs, provider identity and raw feed material are excluded from customer responses. Preserve required attribution in the centralized internal/legal attribution layer.'
      when 'world_bank_indicators' then
        'Commercial paid-output eligible for Geomacro-derived macro signals. Customer delivery remains structured derived intelligence only; source URLs, provider identity and raw upstream payloads are excluded from customer responses. Dataset-specific licence and attribution remain retained in internal provenance.'
      when 'usgs_mcs' then
        'Commercial paid-output eligible for Geomacro-derived critical-minerals signals. Customer delivery remains structured derived intelligence only. Raw redistribution remains disabled; third-party photographs, illustrations, graphics and other separately protected material are excluded. Preserve USGS credit in the centralized internal/legal attribution layer.'
      else notes
    end,
    updated_at = now()
  where source_id in ('gdelt_v2_events', 'world_bank_indicators', 'usgs_mcs');

  select count(*)::integer
    into v_enabled_count
  from public.live_external_sources
  where enabled_for_commercial_signals = true;

  if v_enabled_count <> 3 then
    raise exception 'PAID_OUTPUT_SOURCE_SET_MUST_BE_EXACTLY_THREE_AT_LAUNCH: %', v_enabled_count;
  end if;

  if exists (
    select 1
    from public.live_external_sources
    where enabled_for_commercial_signals = true
      and source_id not in ('gdelt_v2_events', 'world_bank_indicators', 'usgs_mcs')
  ) then
    raise exception 'UNREVIEWED_SOURCE_PRESENT_IN_PAID_OUTPUT_SET';
  end if;
end
$$;
