-- Transactional helpers for B2-verified structured-event evidence bundle cleanup.
-- Caller archives and fully verifies the bundle before invoking delete, then
-- performs a second archive readback after deletion. Restore is exact and
-- removes only archived-source bridge rows inserted by the matching delete RPC.

create or replace function public.geomacro_structured_event_evidence_bundle_candidates(
  p_older_days integer default 7,
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if p_older_days < 7 or p_older_days > 3650 or p_limit < 1 or p_limit > 500 then
    raise exception 'invalid structured evidence bundle candidate request';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('row', q.row_json, 'source_key', q.source_key)
      order by q.created_at, q.event_id, q.fingerprint
    ),
    '[]'::jsonb
  )
  into v_result
  from (
    select
      to_jsonb(e) as row_json,
      m.source_key,
      e.created_at,
      e.event_id,
      e.fingerprint
    from public.live_structured_event_evidence e
    join public.live_structured_events ev on ev.id = e.event_id
    join public.live_fragment_manifest m on m.id = e.fragment_id
    where e.created_at < now() - make_interval(days => p_older_days)
      and ev.last_seen_at < now() - make_interval(days => p_older_days)
      and ev.structured_payload->'_archive'->>'v' = '2'
      and length(trim(m.source_key)) > 0
    order by e.created_at asc, e.event_id asc, e.fingerprint asc
    limit p_limit
  ) q;

  return v_result;
end;
$$;

create or replace function public.geomacro_count_structured_event_evidence_bundle_present(
  p_keys jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_event_id uuid;
  v_fingerprint text;
  v_count integer := 0;
begin
  if jsonb_typeof(p_keys) <> 'array'
     or jsonb_array_length(p_keys) < 1
     or jsonb_array_length(p_keys) > 500 then
    raise exception 'invalid structured evidence presence batch';
  end if;

  for v_item in select value from jsonb_array_elements(p_keys)
  loop
    v_event_id := (v_item->>'event_id')::uuid;
    v_fingerprint := v_item->>'fingerprint';
    if coalesce(v_fingerprint, '') !~ '^[0-9a-f]{64}$' then
      raise exception 'invalid structured evidence presence key';
    end if;
    if exists (
      select 1
      from public.live_structured_event_evidence e
      where e.event_id = v_event_id and e.fingerprint = v_fingerprint
    ) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

create or replace function public.geomacro_delete_structured_event_evidence_bundle(
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_row jsonb;
  v_current_row jsonb;
  v_parent_payload jsonb;
  v_event_id uuid;
  v_fingerprint text;
  v_fragment_id uuid;
  v_created_at timestamptz;
  v_source_key text;
  v_current_source_key text;
  v_bridge jsonb;
  v_inserted_bridges jsonb := '[]'::jsonb;
  v_deleted integer := 0;
  v_rows integer;
  v_expected integer;
begin
  if jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 500 then
    raise exception 'invalid structured evidence delete batch';
  end if;

  v_expected := jsonb_array_length(p_items);

  if (
    select count(*)
    from (
      select distinct
        value->'row'->>'event_id' as event_id,
        value->'row'->>'fingerprint' as fingerprint
      from jsonb_array_elements(p_items)
    ) d
  ) <> v_expected then
    raise exception 'duplicate structured evidence delete key';
  end if;

  perform pg_advisory_xact_lock(hashtext('geomacro_structured_evidence_bundle_cleanup'));

  -- Validate and lock every exact source row before making any bridge or delete.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object' or jsonb_typeof(v_item->'row') <> 'object' then
      raise exception 'invalid structured evidence delete item';
    end if;
    v_row := v_item->'row';
    v_event_id := (v_row->>'event_id')::uuid;
    v_fingerprint := v_row->>'fingerprint';
    v_fragment_id := (v_row->>'fragment_id')::uuid;
    v_created_at := (v_row->>'created_at')::timestamptz;
    v_source_key := trim(v_item->>'source_key');

    if coalesce(v_fingerprint, '') !~ '^[0-9a-f]{64}$'
       or coalesce(v_source_key, '') = ''
       or v_created_at >= now() - interval '7 days' then
      raise exception 'invalid structured evidence delete source';
    end if;

    select to_jsonb(e), m.source_key, ev.structured_payload
      into v_current_row, v_current_source_key, v_parent_payload
      from public.live_structured_event_evidence e
      join public.live_fragment_manifest m on m.id = e.fragment_id
      join public.live_structured_events ev on ev.id = e.event_id
     where e.event_id = v_event_id
       and e.fingerprint = v_fingerprint
       and e.fragment_id = v_fragment_id
     for update of e;

    if not found
       or v_current_row is distinct from v_row
       or v_current_source_key is distinct from v_source_key
       or v_parent_payload->'_archive'->>'v' <> '2' then
      raise exception 'structured evidence source changed before bundle delete';
    end if;
  end loop;

  -- Preserve each unique event/source identity before deleting detailed evidence.
  for v_bridge in
    select distinct jsonb_build_object(
      'event_id', value->'row'->>'event_id',
      'source_key', trim(value->>'source_key')
    )
    from jsonb_array_elements(p_items)
  loop
    insert into public.live_structured_event_archived_sources(event_id, source_key, last_verified_at)
    values ((v_bridge->>'event_id')::uuid, v_bridge->>'source_key', now())
    on conflict (event_id, source_key) do nothing;
    get diagnostics v_rows = row_count;
    if v_rows = 1 then
      v_inserted_bridges := v_inserted_bridges || jsonb_build_array(v_bridge);
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_row := v_item->'row';
    v_event_id := (v_row->>'event_id')::uuid;
    v_fingerprint := v_row->>'fingerprint';

    delete from public.live_structured_event_evidence
     where event_id = v_event_id and fingerprint = v_fingerprint;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
      raise exception 'structured evidence bundle delete count mismatch';
    end if;
    v_deleted := v_deleted + 1;
  end loop;

  if v_deleted <> v_expected then
    raise exception 'structured evidence bundle delete incomplete';
  end if;

  return jsonb_build_object(
    'deleted', v_deleted,
    'inserted_bridges', v_inserted_bridges
  );
end;
$$;

create or replace function public.geomacro_restore_structured_event_evidence_bundle(
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
  v_row jsonb;
  v_bridge jsonb;
  v_event_id uuid;
  v_fingerprint text;
  v_rows integer;
  v_restored integer := 0;
begin
  if jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 500
     or jsonb_typeof(p_inserted_bridges) <> 'array'
     or jsonb_array_length(p_inserted_bridges) > 500 then
    raise exception 'invalid structured evidence restore batch';
  end if;

  perform pg_advisory_xact_lock(hashtext('geomacro_structured_evidence_bundle_cleanup'));

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_row := v_item->'row';
    if jsonb_typeof(v_row) <> 'object' then
      raise exception 'invalid structured evidence restore item';
    end if;
    v_event_id := (v_row->>'event_id')::uuid;
    v_fingerprint := v_row->>'fingerprint';

    if exists (
      select 1 from public.live_structured_event_evidence
      where event_id = v_event_id and fingerprint = v_fingerprint
    ) then
      raise exception 'structured evidence restore source already present';
    end if;

    insert into public.live_structured_event_evidence(
      event_id, fingerprint, fragment_id, fragment_ordinal,
      source_domain, source_url, evidence_title, evidence_published_at,
      country_iso3, country_confidence, country_method, created_at
    ) values (
      v_event_id,
      v_fingerprint,
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

  -- Remove only bridges that the matching delete RPC inserted. Restored live
  -- evidence now carries those source identities again.
  for v_bridge in select value from jsonb_array_elements(p_inserted_bridges)
  loop
    if not exists (
      select 1
      from jsonb_array_elements(p_items) i
      where i->'row'->>'event_id' = v_bridge->>'event_id'
        and trim(i->>'source_key') = v_bridge->>'source_key'
    ) then
      raise exception 'structured evidence restore bridge not owned by batch';
    end if;

    delete from public.live_structured_event_archived_sources
     where event_id = (v_bridge->>'event_id')::uuid
       and source_key = v_bridge->>'source_key';
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
      raise exception 'structured evidence restore bridge remove failed';
    end if;
  end loop;

  return v_restored;
end;
$$;

revoke all on function public.geomacro_structured_event_evidence_bundle_candidates(integer, integer) from public, anon, authenticated;
revoke all on function public.geomacro_count_structured_event_evidence_bundle_present(jsonb) from public, anon, authenticated;
revoke all on function public.geomacro_delete_structured_event_evidence_bundle(jsonb) from public, anon, authenticated;
revoke all on function public.geomacro_restore_structured_event_evidence_bundle(jsonb, jsonb) from public, anon, authenticated;

grant execute on function public.geomacro_structured_event_evidence_bundle_candidates(integer, integer) to service_role;
grant execute on function public.geomacro_count_structured_event_evidence_bundle_present(jsonb) to service_role;
grant execute on function public.geomacro_delete_structured_event_evidence_bundle(jsonb) to service_role;
grant execute on function public.geomacro_restore_structured_event_evidence_bundle(jsonb, jsonb) to service_role;

comment on function public.geomacro_delete_structured_event_evidence_bundle(jsonb) is
  'Atomically preserves unique event/source rights bridges and deletes exact unchanged B2-verified structured evidence rows in batches up to 500.';
comment on function public.geomacro_restore_structured_event_evidence_bundle(jsonb, jsonb) is
  'Atomically restores exact structured evidence rows and removes only archived-source bridges inserted by the matching cleanup batch.';
