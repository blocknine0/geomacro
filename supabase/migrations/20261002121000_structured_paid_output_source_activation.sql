-- Geomacro paid structured-output source activation control.
--
-- Canonical migrations must replay from zero without depending on runtime
-- certification evidence. This migration therefore installs the production
-- activation function but does not execute it automatically.
--
-- Production activation is an explicit service-role operation after repository
-- CI and the authoritative certification census have been verified. The
-- function remains fail-closed: it does not authorize raw redistribution and it
-- cannot promote or enable any source outside the exact certified three-domain
-- launch set.

create or replace function public.activate_structured_paid_output_sources()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_target_source_count integer;
  v_certified_count integer;
  v_enabled_count integer;
  v_enabled_ids text[];
begin
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
    and c.schema_status = 'PASS'
    and c.provenance_status = 'PASS'
    and c.independence_status = 'PASS'
    and c.adapter_status = 'TESTED'
    and c.runtime_status = 'PASS'
    and c.fallback_status = 'READY'
    and s.commercial_usage_status in ('COMMERCIAL_OK', 'DERIVED_ONLY')
    and s.enabled_for_ingestion = true;

  if v_certified_count <> 3 then
    raise exception 'PAID_OUTPUT_SOURCE_ACTIVATION_REQUIRES_THREE_CERTIFIED_SOURCES: %', v_certified_count;
  end if;

  if exists (
    select 1
    from public.live_external_sources s
    left join public.live_source_certification_records c using (source_id)
    where s.enabled_for_commercial_signals = true
      and s.source_id not in ('gdelt_v2_events', 'world_bank_indicators', 'usgs_mcs')
  ) then
    raise exception 'UNREVIEWED_SOURCE_PRESENT_IN_PAID_OUTPUT_SET';
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

  select count(*)::integer,
         array_agg(source_id order by source_id)
    into v_enabled_count, v_enabled_ids
  from public.live_external_sources
  where enabled_for_commercial_signals = true;

  if v_enabled_count <> 3 then
    raise exception 'PAID_OUTPUT_SOURCE_SET_MUST_BE_EXACTLY_THREE_AT_LAUNCH: %', v_enabled_count;
  end if;

  if v_enabled_ids <> array['gdelt_v2_events','usgs_mcs','world_bank_indicators']::text[] then
    raise exception 'PAID_OUTPUT_SOURCE_SET_IDENTITY_MISMATCH: %', v_enabled_ids;
  end if;

  return jsonb_build_object(
    'ok', true,
    'delivery_boundary', 'STRUCTURED_DERIVED_INTELLIGENCE_ONLY',
    'raw_redistribution_requirement', false,
    'enabled_source_count', v_enabled_count,
    'enabled_source_ids', to_jsonb(v_enabled_ids),
    'execution_authorized', false
  );
end
$$;

revoke all on function public.activate_structured_paid_output_sources() from public;
revoke all on function public.activate_structured_paid_output_sources() from anon;
revoke all on function public.activate_structured_paid_output_sources() from authenticated;
grant execute on function public.activate_structured_paid_output_sources() to service_role;

comment on function public.activate_structured_paid_output_sources() is
  'Explicit service-role-only activation for Geomacro structured-derived paid output. Requires the exact three certified launch sources and never enables raw redistribution or execution authorization.';
