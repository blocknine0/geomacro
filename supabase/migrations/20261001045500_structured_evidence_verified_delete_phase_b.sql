-- Phase B for structured-event evidence cold cleanup.
-- These RPCs never contact B2 themselves. The caller MUST perform a full B2
-- readback and member restore before invoking delete, and again before finalize.
-- Archive-index row_json remains complete until finalize so rollback is exact.

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

create or replace function public.geomacro_delete_verified_structured_evidence(
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_bridge jsonb;
  v_event_id uuid;
  v_fingerprint text;
  v_source_key text;
  v_bundle_key text;
  v_bundle_sha256 text;
  v_row_sha256 text;
  v_index_row record;
  v_current_row jsonb;
  v_current_source_key text;
  v_before_rights jsonb;
  v_after_rights jsonb;
  v_inserted_bridges jsonb := '[]'::jsonb;
  v_deleted integer := 0;
  v_rows integer;
begin
  if jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 500 then
    raise exception 'STRUCTURED_EVIDENCE_DELETE_CONFIG_INVALID';
  end if;

  if (
    select count(*)
    from (
      select distinct value->>'event_id' as event_id, value->>'fingerprint' as fingerprint
      from jsonb_array_elements(p_items)
    ) d
  ) <> jsonb_array_length(p_items) then
    raise exception 'STRUCTURED_EVIDENCE_DELETE_DUPLICATE_KEY';
  end if;

  perform pg_advisory_xact_lock(hashtext('geomacro_structured_evidence_phase_b'));

  select coalesce(jsonb_agg(jsonb_build_object(
    'event_id', r.event_id,
    'evaluated_status', r.evaluated_status,
    'reason_codes', r.reason_codes,
    'source_keys', r.source_keys
  ) order by r.event_id), '[]'::jsonb)
  into v_before_rights
  from public.live_structured_event_commercial_rights_evaluation r
  where r.event_id in (
    select distinct (value->>'event_id')::uuid from jsonb_array_elements(p_items)
  );

  -- Lock and validate every exact hot row and its already B2-verified archive index.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_event_id := (v_item->>'event_id')::uuid;
    v_fingerprint := v_item->>'fingerprint';
    v_source_key := v_item->>'source_key';
    v_bundle_key := v_item->>'bundle_key';
    v_bundle_sha256 := v_item->>'bundle_sha256';
    v_row_sha256 := v_item->>'row_sha256';

    if coalesce(v_fingerprint, '') !~ '^[0-9a-f]{64}$'
       or coalesce(v_bundle_sha256, '') !~ '^[0-9a-f]{64}$'
       or coalesce(v_row_sha256, '') !~ '^[0-9a-f]{64}$'
       or coalesce(trim(v_source_key), '') = ''
       or coalesce(v_bundle_key, '') !~ '^geomacro-evidence/v1/structured-event-evidence-bundles/[A-Za-z0-9_./-]+[.]json[.]gz$' then
      raise exception 'STRUCTURED_EVIDENCE_DELETE_METADATA_INVALID';
    end if;

    select a.event_id, a.fingerprint, a.source_key, a.bundle_key,
           a.bundle_sha256, a.row_sha256, a.row_json,
           to_jsonb(e) as current_row, m.source_key as current_source_key
    into v_index_row
    from public.live_structured_event_evidence_archive_index a
    join public.live_structured_event_evidence e
      on e.event_id = a.event_id and e.fingerprint = a.fingerprint
    join public.live_fragment_manifest m on m.id = e.fragment_id
    where a.event_id = v_event_id and a.fingerprint = v_fingerprint
    for update of a, e;

    if not found
       or v_index_row.row_json->'_archive' is not null
       or v_index_row.source_key is distinct from v_source_key
       or v_index_row.bundle_key is distinct from v_bundle_key
       or v_index_row.bundle_sha256 is distinct from v_bundle_sha256
       or v_index_row.row_sha256 is distinct from v_row_sha256
       or v_index_row.current_source_key is distinct from v_source_key
       or v_index_row.current_row is distinct from v_index_row.row_json then
      raise exception 'STRUCTURED_EVIDENCE_DELETE_SOURCE_CHANGED';
    end if;
  end loop;

  -- Preserve unique event/source identity first. Track only bridges inserted by
  -- this transaction so a rollback RPC can remove exactly those bridges later.
  for v_bridge in
    select distinct jsonb_build_object(
      'event_id', value->>'event_id',
      'source_key', value->>'source_key'
    )
    from jsonb_array_elements(p_items)
  loop
    insert into public.live_structured_event_archived_sources(event_id, source_key, last_verified_at)
    values ((v_bridge->>'event_id')::uuid, v_bridge->>'source_key', now())
    on conflict (event_id, source_key) do update
      set last_verified_at = excluded.last_verified_at;
    get diagnostics v_rows = row_count;

    -- ON CONFLICT UPDATE also reports one row; determine ownership by whether
    -- this bridge pre-existed before the call using the first_archived_at stamp.
    if exists (
      select 1
      from public.live_structured_event_archived_sources a
      where a.event_id = (v_bridge->>'event_id')::uuid
        and a.source_key = v_bridge->>'source_key'
        and a.first_archived_at = a.last_verified_at
    ) then
      v_inserted_bridges := v_inserted_bridges || jsonb_build_array(v_bridge);
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    delete from public.live_structured_event_evidence
    where event_id = (v_item->>'event_id')::uuid
      and fingerprint = v_item->>'fingerprint';
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
      raise exception 'STRUCTURED_EVIDENCE_DELETE_COUNT_MISMATCH';
    end if;
    v_deleted := v_deleted + 1;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
    'event_id', r.event_id,
    'evaluated_status', r.evaluated_status,
    'reason_codes', r.reason_codes,
    'source_keys', r.source_keys
  ) order by r.event_id), '[]'::jsonb)
  into v_after_rights
  from public.live_structured_event_commercial_rights_evaluation r
  where r.event_id in (
    select distinct (value->>'event_id')::uuid from jsonb_array_elements(p_items)
  );

  if v_before_rights is distinct from v_after_rights then
    raise exception 'STRUCTURED_EVIDENCE_DELETE_RIGHTS_CHANGED';
  end if;

  return jsonb_build_object(
    'deleted', v_deleted,
    'inserted_bridges', v_inserted_bridges,
    'rights_unchanged', true
  );
end;
$$;

create or replace function public.geomacro_restore_verified_structured_evidence(
  p_items jsonb,
  p_inserted_bridges jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_bridge jsonb;
  v_row jsonb;
  v_index_row record;
  v_rows integer;
  v_restored integer := 0;
  v_before_rights jsonb;
  v_after_rights jsonb;
begin
  if jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 500
     or jsonb_typeof(p_inserted_bridges) <> 'array'
     or jsonb_array_length(p_inserted_bridges) > 500 then
    raise exception 'STRUCTURED_EVIDENCE_RESTORE_CONFIG_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtext('geomacro_structured_evidence_phase_b'));

  select coalesce(jsonb_agg(jsonb_build_object(
    'event_id', r.event_id,
    'evaluated_status', r.evaluated_status,
    'reason_codes', r.reason_codes,
    'source_keys', r.source_keys
  ) order by r.event_id), '[]'::jsonb)
  into v_before_rights
  from public.live_structured_event_commercial_rights_evaluation r
  where r.event_id in (
    select distinct (value->>'event_id')::uuid from jsonb_array_elements(p_items)
  );

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    select a.row_json, a.source_key, a.bundle_key, a.bundle_sha256, a.row_sha256
    into v_index_row
    from public.live_structured_event_evidence_archive_index a
    where a.event_id = (v_item->>'event_id')::uuid
      and a.fingerprint = v_item->>'fingerprint'
    for update;

    if not found
       or v_index_row.row_json->'_archive' is not null
       or v_index_row.source_key is distinct from v_item->>'source_key'
       or v_index_row.bundle_key is distinct from v_item->>'bundle_key'
       or v_index_row.bundle_sha256 is distinct from v_item->>'bundle_sha256'
       or v_index_row.row_sha256 is distinct from v_item->>'row_sha256' then
      raise exception 'STRUCTURED_EVIDENCE_RESTORE_ARCHIVE_INDEX_CHANGED';
    end if;

    if exists (
      select 1 from public.live_structured_event_evidence e
      where e.event_id = (v_item->>'event_id')::uuid
        and e.fingerprint = v_item->>'fingerprint'
    ) then
      raise exception 'STRUCTURED_EVIDENCE_RESTORE_ALREADY_PRESENT';
    end if;

    v_row := v_index_row.row_json;
    insert into public.live_structured_event_evidence(
      event_id, fingerprint, fragment_id, fragment_ordinal,
      source_domain, source_url, evidence_title, evidence_published_at,
      country_iso3, country_confidence, country_method, created_at
    ) values (
      (v_row->>'event_id')::uuid,
      v_row->>'fingerprint',
      (v_row->>'fragment_id')::uuid,
      (v_row->>'fragment_ordinal')::integer,
      v_row->>'source_domain',
      v_row->>'source_url',
      v_row->>'evidence_title',
      case when v_row->>'evidence_published_at' is null then null else (v_row->>'evidence_published_at')::timestamptz end,
      v_row->>'country_iso3',
      case when v_row->>'country_confidence' is null then null else (v_row->>'country_confidence')::numeric end,
      v_row->>'country_method',
      (v_row->>'created_at')::timestamptz
    );
    v_restored := v_restored + 1;
  end loop;

  for v_bridge in select value from jsonb_array_elements(p_inserted_bridges)
  loop
    if not exists (
      select 1 from jsonb_array_elements(p_items) i
      where i->>'event_id' = v_bridge->>'event_id'
        and i->>'source_key' = v_bridge->>'source_key'
    ) then
      raise exception 'STRUCTURED_EVIDENCE_RESTORE_BRIDGE_NOT_OWNED';
    end if;

    delete from public.live_structured_event_archived_sources
    where event_id = (v_bridge->>'event_id')::uuid
      and source_key = v_bridge->>'source_key';
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
    'event_id', r.event_id,
    'evaluated_status', r.evaluated_status,
    'reason_codes', r.reason_codes,
    'source_keys', r.source_keys
  ) order by r.event_id), '[]'::jsonb)
  into v_after_rights
  from public.live_structured_event_commercial_rights_evaluation r
  where r.event_id in (
    select distinct (value->>'event_id')::uuid from jsonb_array_elements(p_items)
  );

  if v_before_rights is distinct from v_after_rights then
    raise exception 'STRUCTURED_EVIDENCE_RESTORE_RIGHTS_CHANGED';
  end if;

  return v_restored;
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
revoke all on function public.geomacro_delete_verified_structured_evidence(jsonb) from public, anon, authenticated;
revoke all on function public.geomacro_restore_verified_structured_evidence(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.geomacro_finalize_verified_structured_evidence(jsonb) from public, anon, authenticated;

grant execute on function public.geomacro_structured_evidence_delete_candidates(integer) to service_role;
grant execute on function public.geomacro_count_structured_evidence_present(jsonb) to service_role;
grant execute on function public.geomacro_delete_verified_structured_evidence(jsonb) to service_role;
grant execute on function public.geomacro_restore_verified_structured_evidence(jsonb, jsonb) to service_role;
grant execute on function public.geomacro_finalize_verified_structured_evidence(jsonb) to service_role;

comment on function public.geomacro_delete_verified_structured_evidence(jsonb) is
  'Phase B only: atomically preserves source identity, deletes exact unchanged evidence rows already indexed after verified B2 archival, and fails closed if commercial-rights evaluation changes.';
comment on function public.geomacro_finalize_verified_structured_evidence(jsonb) is
  'Phase B finalization after a second full B2 readback: compacts archive-index row_json to a minimal immutable B2 pointer only after the hot evidence row is absent.';
