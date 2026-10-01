-- Phase B helper RPCs for structured-event evidence cold cleanup.
-- Destructive evidence operations intentionally stay application-side so the
-- database migration chain contains no stored-function DELETE from evidence or
-- archived-source tables. The caller must verify B2 before deletion and again
-- before finalization.

create or replace function public.geomacro_structured_evidence_delete_candidates(
  p_limit integer default 500
)
returns table (
  event_id uuid,
  fingerprint text,
  source_key text,
  bundle_key text,
  bundle_sha256 text,
  row_sha256 text,
  row_json jsonb
)
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_limit < 1 or p_limit > 500 then
    raise exception 'STRUCTURED_EVIDENCE_DELETE_CONFIG_INVALID';
  end if;

  return query
  with first_bundle as (
    select a.bundle_key
    from public.live_structured_event_evidence_archive_index a
    join public.live_structured_event_evidence e
      on e.event_id = a.event_id and e.fingerprint = a.fingerprint
    join public.live_fragment_manifest m on m.id = e.fragment_id
    where a.row_json->'_archive' is null
      and to_jsonb(e) = a.row_json
      and m.source_key = a.source_key
    order by a.archived_at asc, a.bundle_key asc
    limit 1
  )
  select
    a.event_id,
    a.fingerprint,
    a.source_key,
    a.bundle_key,
    a.bundle_sha256,
    a.row_sha256,
    a.row_json
  from public.live_structured_event_evidence_archive_index a
  join public.live_structured_event_evidence e
    on e.event_id = a.event_id and e.fingerprint = a.fingerprint
  join public.live_fragment_manifest m on m.id = e.fragment_id
  where a.bundle_key = (select fb.bundle_key from first_bundle fb)
    and a.row_json->'_archive' is null
    and to_jsonb(e) = a.row_json
    and m.source_key = a.source_key
  order by a.archived_at asc, a.event_id asc, a.fingerprint asc
  limit p_limit;
end;
$$;

create or replace function public.geomacro_count_structured_evidence_present(
  p_keys jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_count integer := 0;
begin
  if jsonb_typeof(p_keys) <> 'array'
     or jsonb_array_length(p_keys) < 1
     or jsonb_array_length(p_keys) > 500 then
    raise exception 'STRUCTURED_EVIDENCE_PRESENCE_CONFIG_INVALID';
  end if;

  for v_item in select value from jsonb_array_elements(p_keys)
  loop
    if exists (
      select 1
      from public.live_structured_event_evidence e
      where e.event_id = (v_item->>'event_id')::uuid
        and e.fingerprint = v_item->>'fingerprint'
    ) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

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
    set row_json = jsonb_build_object(
      '_archive', jsonb_build_object(
        'v', 1,
        't', 'b2-evidence-bundle',
        'k', a.bundle_key,
        'a', a.bundle_sha256,
        'p', a.row_sha256,
        'm', a.event_id::text || ':' || a.fingerprint
      )
    )
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

revoke all on function public.geomacro_structured_evidence_delete_candidates(integer) from public, anon, authenticated;
revoke all on function public.geomacro_count_structured_evidence_present(jsonb) from public, anon, authenticated;
revoke all on function public.geomacro_finalize_verified_structured_evidence(jsonb) from public, anon, authenticated;

grant execute on function public.geomacro_structured_evidence_delete_candidates(integer) to service_role;
grant execute on function public.geomacro_count_structured_evidence_present(jsonb) to service_role;
grant execute on function public.geomacro_finalize_verified_structured_evidence(jsonb) to service_role;

comment on function public.geomacro_structured_evidence_delete_candidates(integer) is
  'Returns one bounded B2 bundle of exact evidence rows whose current hot JSON and source identity still match the verified archive index.';
comment on function public.geomacro_finalize_verified_structured_evidence(jsonb) is
  'After application-side exact deletion and a second full B2 readback, compacts archive-index row_json to a minimal immutable B2 pointer.';
