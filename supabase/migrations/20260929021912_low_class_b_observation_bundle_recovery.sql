create or replace function public.geomacro_next_observation_archive_candidates(p_suffix text, p_limit integer default 100)
returns table(observation_id text, raw_payload jsonb, raw_hash text, ingested_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_suffix !~ '^[0-9a-f]$' or p_limit < 1 or p_limit > 100 then
    raise exception 'OBS_ARCHIVE_CANDIDATE_ARGS_INVALID';
  end if;
  return query
  select o.observation_id, o.raw_payload, o.raw_hash, o.ingested_at
  from public.live_external_observations o
  where o.raw_payload is not null
    and o.ingested_at < now() - interval '72 hours'
    and right(lower(o.observation_id), 1) = p_suffix
  order by o.ingested_at asc
  limit p_limit;
end;
$$;
revoke all on function public.geomacro_next_observation_archive_candidates(text, integer) from public, anon, authenticated;
grant execute on function public.geomacro_next_observation_archive_candidates(text, integer) to service_role;

create or replace function public.geomacro_clear_verified_observation_bundle(p_items jsonb)
returns table(observation_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  v_id text;
  v_hash text;
  v_payload jsonb;
  cleared_id text;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 100 then
    raise exception 'OBS_BUNDLE_CLEAR_ARGS_INVALID';
  end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    v_id := item->>'observation_id';
    v_hash := item->>'raw_hash';
    v_payload := item->'raw_payload';
    if coalesce(length(v_id), 0) < 1 or length(v_id) > 512 or v_hash !~ '^[a-f0-9]{64}$' or v_payload is null or v_payload = 'null'::jsonb then
      raise exception 'OBS_BUNDLE_CLEAR_ITEM_INVALID';
    end if;

    update public.live_external_observations o
       set raw_payload = null
     where o.observation_id = v_id
       and o.raw_hash = v_hash
       and o.raw_payload is not null
       and o.raw_payload = v_payload
    returning o.observation_id into cleared_id;

    if cleared_id is null then
      raise exception 'OBS_BUNDLE_SOURCE_CHANGED:%', v_id;
    end if;
    observation_id := cleared_id;
    return next;
    cleared_id := null;
  end loop;
end;
$$;
revoke all on function public.geomacro_clear_verified_observation_bundle(jsonb) from public, anon, authenticated;
grant execute on function public.geomacro_clear_verified_observation_bundle(jsonb) to service_role;
