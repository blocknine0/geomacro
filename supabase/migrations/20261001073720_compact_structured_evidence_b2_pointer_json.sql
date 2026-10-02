create or replace function public.geomacro_finalize_verified_structured_evidence(
  p_items jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_rows integer;
  v_count integer := 0;
begin
  if jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 500 then
    raise exception 'STRUCTURED_EVIDENCE_FINALIZE_CONFIG_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtext('geomacro_structured_evidence_phase_b'));

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if coalesce(v_item->>'fingerprint', '') !~ '^[0-9a-f]{64}$'
       or coalesce(v_item->>'bundle_sha256', '') !~ '^[0-9a-f]{64}$'
       or coalesce(v_item->>'row_sha256', '') !~ '^[0-9a-f]{64}$'
       or coalesce(trim(v_item->>'source_key'), '') = ''
       or coalesce(v_item->>'bundle_key', '') !~ '^geomacro-evidence/v1/structured-event-evidence-bundles/[A-Za-z0-9_./-]+[.]json[.]gz$' then
      raise exception 'STRUCTURED_EVIDENCE_FINALIZE_METADATA_INVALID';
    end if;

    if exists (
      select 1 from public.live_structured_event_evidence e
      where e.event_id = (v_item->>'event_id')::uuid
        and e.fingerprint = v_item->>'fingerprint'
    ) then
      raise exception 'STRUCTURED_EVIDENCE_FINALIZE_SOURCE_STILL_PRESENT';
    end if;

    update public.live_structured_event_evidence_archive_index a
    set row_json = jsonb_build_object('_archive', jsonb_build_object('v', 2))
    where a.event_id = (v_item->>'event_id')::uuid
      and a.fingerprint = v_item->>'fingerprint'
      and a.source_key = v_item->>'source_key'
      and a.bundle_key = v_item->>'bundle_key'
      and a.bundle_sha256 = v_item->>'bundle_sha256'
      and a.row_sha256 = v_item->>'row_sha256'
      and a.row_json->'_archive' is null;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
      raise exception 'STRUCTURED_EVIDENCE_FINALIZE_INDEX_CHANGED';
    end if;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

update public.live_structured_event_evidence_archive_index
set row_json = jsonb_build_object('_archive', jsonb_build_object('v', 2))
where row_json->'_archive' is not null;

comment on function public.geomacro_finalize_verified_structured_evidence(jsonb) is
  'After application-side exact deletion and a second full B2 readback, compacts archive-index row_json to a minimal marker; immutable bundle/member restore metadata remains in dedicated columns.';
