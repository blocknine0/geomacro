-- Bounded bundle cleanup for cold structured evidence.
-- All mutating functions run as SECURITY INVOKER and are executable only by service_role.

create or replace function public.geomacro_structured_evidence_bundle_candidates(p_older_days integer, p_limit integer)
returns table(event_id uuid, fingerprint text, source_key text, row_json jsonb)
language plpgsql security invoker set search_path = public as $$
begin
  if p_older_days < 7 or p_older_days > 3650 or p_limit < 1 or p_limit > 1000 then
    raise exception 'STRUCTURED_EVIDENCE_BUNDLE_CONFIG_INVALID';
  end if;
  return query
  select e.event_id, e.fingerprint, m.source_key, to_jsonb(e)
  from public.live_structured_event_evidence e
  join public.live_structured_events ev on ev.id = e.event_id
  join public.live_fragment_manifest m on m.id = e.fragment_id
  where e.created_at < now() - make_interval(days => p_older_days)
    and ev.last_seen_at < now() - make_interval(days => p_older_days)
    and ev.structured_payload->'_archive'->>'v' = '2'
    and nullif(btrim(m.source_key), '') is not null
  order by e.created_at, e.event_id, e.fingerprint
  limit p_limit;
end; $$;

create or replace function public.geomacro_structured_evidence_bundle_present_count(p_keys jsonb)
returns integer language plpgsql security invoker set search_path = public as $$
declare v_count integer;
begin
  if jsonb_typeof(p_keys) <> 'array' or jsonb_array_length(p_keys) < 1 or jsonb_array_length(p_keys) > 1000 then
    raise exception 'STRUCTURED_EVIDENCE_BUNDLE_KEYS_INVALID';
  end if;
  select count(*)::integer into v_count
  from public.live_structured_event_evidence e
  join jsonb_to_recordset(p_keys) as x(event_id uuid, fingerprint text)
    on x.event_id=e.event_id and x.fingerprint=e.fingerprint;
  return v_count;
end; $$;

create or replace function public.geomacro_delete_structured_evidence_bundle(p_rows jsonb, p_older_days integer)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_item jsonb; v_event_id uuid; v_fingerprint text; v_source_key text; v_expected jsonb;
  v_current jsonb; v_fragment_id uuid; v_fragment_source text; v_created_at timestamptz;
  v_parent_seen timestamptz; v_parent_payload jsonb; v_deleted integer := 0; v_inserted uuid;
  v_inserted_bridges jsonb := '[]'::jsonb; v_before jsonb := '{}'::jsonb; v_rights jsonb; v_after jsonb; v_key text;
begin
  if p_older_days < 7 or p_older_days > 3650 or jsonb_typeof(p_rows) <> 'array'
     or jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 1000 then
    raise exception 'STRUCTURED_EVIDENCE_BUNDLE_DELETE_CONFIG_INVALID';
  end if;

  for v_item in select value from jsonb_array_elements(p_rows) loop
    v_event_id := (v_item->>'event_id')::uuid; v_fingerprint := v_item->>'fingerprint';
    v_source_key := btrim(v_item->>'source_key'); v_expected := v_item->'expected_row';
    if v_fingerprint !~ '^[0-9a-f]{64}$' or coalesce(v_source_key,'')='' or jsonb_typeof(v_expected)<>'object' then
      raise exception 'STRUCTURED_EVIDENCE_BUNDLE_DELETE_ITEM_INVALID';
    end if;

    select to_jsonb(e), e.fragment_id, e.created_at into v_current, v_fragment_id, v_created_at
    from public.live_structured_event_evidence e
    where e.event_id=v_event_id and e.fingerprint=v_fingerprint for update;
    if v_current is null or v_current is distinct from v_expected then raise exception 'STRUCTURED_EVIDENCE_BUNDLE_DELETE_SOURCE_CHANGED'; end if;
    if v_created_at >= now()-make_interval(days=>p_older_days) then raise exception 'STRUCTURED_EVIDENCE_BUNDLE_DELETE_SOURCE_TOO_NEW'; end if;

    select m.source_key into v_fragment_source from public.live_fragment_manifest m where m.id=v_fragment_id for share;
    if btrim(coalesce(v_fragment_source,'')) is distinct from v_source_key then raise exception 'STRUCTURED_EVIDENCE_BUNDLE_DELETE_SOURCE_KEY_MISMATCH'; end if;

    select ev.last_seen_at, ev.structured_payload into v_parent_seen, v_parent_payload
    from public.live_structured_events ev where ev.id=v_event_id for share;
    if v_parent_seen is null or v_parent_seen >= now()-make_interval(days=>p_older_days) or v_parent_payload->'_archive'->>'v'<>'2' then
      raise exception 'STRUCTURED_EVIDENCE_BUNDLE_DELETE_PARENT_NOT_COLD';
    end if;

    v_key := v_event_id::text;
    if not (v_before ? v_key) then
      select jsonb_build_object('event_status',ev.commercial_eligibility_status,'event_reasons',coalesce(to_jsonb(ev.commercial_eligibility_reason_codes),'[]'::jsonb),
        'evaluated_status',r.evaluated_status,'evaluated_reasons',coalesce(to_jsonb(r.reason_codes),'[]'::jsonb),'source_keys',coalesce(to_jsonb(r.source_keys),'[]'::jsonb))
      into v_rights from public.live_structured_events ev join public.live_structured_event_commercial_rights_evaluation r on r.event_id=ev.id where ev.id=v_event_id;
      if v_rights is null then raise exception 'STRUCTURED_EVIDENCE_BUNDLE_DELETE_RIGHTS_READ_FAILED'; end if;
      v_before := v_before || jsonb_build_object(v_key,v_rights);
    end if;

    v_inserted := null;
    insert into public.live_structured_event_archived_sources(event_id,source_key,last_verified_at)
    values(v_event_id,v_source_key,now()) on conflict(event_id,source_key) do nothing returning event_id into v_inserted;
    if v_inserted is not null then v_inserted_bridges := v_inserted_bridges || jsonb_build_array(jsonb_build_object('event_id',v_event_id,'source_key',v_source_key)); end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_rows) loop
    v_event_id := (v_item->>'event_id')::uuid; v_fingerprint := v_item->>'fingerprint'; v_expected := v_item->'expected_row';
    delete from public.live_structured_event_evidence e
    where e.event_id=v_event_id and e.fingerprint=v_fingerprint and to_jsonb(e)=v_expected;
    if not found then raise exception 'STRUCTURED_EVIDENCE_BUNDLE_DELETE_UNCONFIRMED'; end if;
    v_deleted := v_deleted+1;
  end loop;

  for v_key in select jsonb_object_keys(v_before) loop
    select jsonb_build_object('event_status',ev.commercial_eligibility_status,'event_reasons',coalesce(to_jsonb(ev.commercial_eligibility_reason_codes),'[]'::jsonb),
      'evaluated_status',r.evaluated_status,'evaluated_reasons',coalesce(to_jsonb(r.reason_codes),'[]'::jsonb),'source_keys',coalesce(to_jsonb(r.source_keys),'[]'::jsonb))
    into v_after from public.live_structured_events ev join public.live_structured_event_commercial_rights_evaluation r on r.event_id=ev.id where ev.id=v_key::uuid;
    if v_after is null or v_after is distinct from v_before->v_key then raise exception 'STRUCTURED_EVIDENCE_BUNDLE_DELETE_RIGHTS_CHANGED'; end if;
  end loop;

  return jsonb_build_object('deleted',v_deleted,'inserted_bridges',v_inserted_bridges,'before_rights',v_before);
end; $$;

create or replace function public.geomacro_restore_structured_evidence_bundle(p_rows jsonb, p_inserted_bridges jsonb, p_expected_rights jsonb)
returns integer language plpgsql security invoker set search_path = public as $$
declare v_item jsonb; v_row jsonb; v_event_id uuid; v_fingerprint text; v_restored integer:=0; v_bridge jsonb; v_key text; v_rights jsonb;
begin
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)<1 or jsonb_array_length(p_rows)>1000
     or jsonb_typeof(p_inserted_bridges)<>'array' or jsonb_typeof(p_expected_rights)<>'object' then raise exception 'STRUCTURED_EVIDENCE_BUNDLE_RESTORE_CONFIG_INVALID'; end if;
  for v_item in select value from jsonb_array_elements(p_rows) loop
    v_row:=v_item->'expected_row'; v_event_id:=(v_row->>'event_id')::uuid; v_fingerprint:=v_row->>'fingerprint';
    if exists(select 1 from public.live_structured_event_evidence e where e.event_id=v_event_id and e.fingerprint=v_fingerprint) then raise exception 'STRUCTURED_EVIDENCE_BUNDLE_RESTORE_COLLISION'; end if;
    insert into public.live_structured_event_evidence(event_id,fingerprint,fragment_id,fragment_ordinal,source_domain,source_url,evidence_title,evidence_published_at,country_iso3,country_confidence,country_method,created_at)
    values(v_event_id,v_fingerprint,(v_row->>'fragment_id')::uuid,nullif(v_row->>'fragment_ordinal','')::integer,v_row->>'source_domain',v_row->>'source_url',v_row->>'evidence_title',nullif(v_row->>'evidence_published_at','')::timestamptz,v_row->>'country_iso3',nullif(v_row->>'country_confidence','')::numeric,v_row->>'country_method',(v_row->>'created_at')::timestamptz);
    v_restored:=v_restored+1;
  end loop;
  for v_bridge in select value from jsonb_array_elements(p_inserted_bridges) loop
    delete from public.live_structured_event_archived_sources a where a.event_id=(v_bridge->>'event_id')::uuid and a.source_key=v_bridge->>'source_key';
  end loop;
  for v_key in select jsonb_object_keys(p_expected_rights) loop
    select jsonb_build_object('event_status',ev.commercial_eligibility_status,'event_reasons',coalesce(to_jsonb(ev.commercial_eligibility_reason_codes),'[]'::jsonb),
      'evaluated_status',r.evaluated_status,'evaluated_reasons',coalesce(to_jsonb(r.reason_codes),'[]'::jsonb),'source_keys',coalesce(to_jsonb(r.source_keys),'[]'::jsonb))
    into v_rights from public.live_structured_events ev join public.live_structured_event_commercial_rights_evaluation r on r.event_id=ev.id where ev.id=v_key::uuid;
    if v_rights is null or v_rights is distinct from p_expected_rights->v_key then raise exception 'STRUCTURED_EVIDENCE_BUNDLE_RESTORE_RIGHTS_CHANGED'; end if;
  end loop;
  return v_restored;
end; $$;

revoke all on function public.geomacro_structured_evidence_bundle_candidates(integer,integer) from public,anon,authenticated;
revoke all on function public.geomacro_structured_evidence_bundle_present_count(jsonb) from public,anon,authenticated;
revoke all on function public.geomacro_delete_structured_evidence_bundle(jsonb,integer) from public,anon,authenticated;
revoke all on function public.geomacro_restore_structured_evidence_bundle(jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.geomacro_structured_evidence_bundle_candidates(integer,integer) to service_role;
grant execute on function public.geomacro_structured_evidence_bundle_present_count(jsonb) to service_role;
grant execute on function public.geomacro_delete_structured_evidence_bundle(jsonb,integer) to service_role;
grant execute on function public.geomacro_restore_structured_evidence_bundle(jsonb,jsonb,jsonb) to service_role;
