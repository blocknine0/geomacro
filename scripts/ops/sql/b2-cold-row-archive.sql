-- LIVE PRODUCTION CONTRACT
-- Supabase is hot operational state only. Historical rows are removable only
-- after a B2 bundle has been fully read back and verified by the worker.

create or replace function public.geomacro_next_cold_structured_events_v1(
  p_limit integer default 100
)
returns table(event jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_limit < 1 or p_limit > 100 then
    raise exception 'COLD_EVENT_LIMIT_OUT_OF_RANGE';
  end if;
  return query
  select to_jsonb(e)
  from public.live_structured_events e
  where e.last_seen_at < now() - interval '7 days'
    and not exists (
      select 1 from public.live_realtime_escalation_queue q
      where q.trigger_event_id = e.id and q.status = 'QUEUED'
    )
  order by e.last_seen_at asc, e.id asc
  limit p_limit;
end;
$$;

revoke all on function public.geomacro_next_cold_structured_events_v1(integer) from public, anon, authenticated;
grant execute on function public.geomacro_next_cold_structured_events_v1(integer) to service_role;

create or replace function public.geomacro_delete_verified_cold_structured_events_v1(
  p_cutoff timestamptz,
  p_items jsonb
)
returns table(event_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  v_id uuid;
  v_updated timestamptz;
  v_last_seen timestamptz;
  deleted_id uuid;
begin
  if p_cutoff > now() - interval '7 days'
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 100 then
    raise exception 'COLD_EVENT_DELETE_ARGS_INVALID';
  end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_id := (item->>'id')::uuid;
      v_updated := (item->>'updated_at')::timestamptz;
      v_last_seen := (item->>'last_seen_at')::timestamptz;
    exception when others then
      raise exception 'COLD_EVENT_DELETE_ITEM_INVALID';
    end;

    delete from public.live_structured_events e
    where e.id = v_id
      and e.updated_at = v_updated
      and e.last_seen_at = v_last_seen
      and e.last_seen_at < p_cutoff
      and not exists (
        select 1 from public.live_realtime_escalation_queue q
        where q.trigger_event_id = e.id and q.status = 'QUEUED'
      )
    returning e.id into deleted_id;

    if deleted_id is null then
      raise exception 'COLD_EVENT_SOURCE_CHANGED:%', v_id;
    end if;
    event_id := deleted_id;
    return next;
    deleted_id := null;
  end loop;
end;
$$;

revoke all on function public.geomacro_delete_verified_cold_structured_events_v1(timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.geomacro_delete_verified_cold_structured_events_v1(timestamptz,jsonb) to service_role;

create index if not exists live_external_observations_cold_row_idx
on public.live_external_observations (ingested_at, observation_id)
where raw_payload is null and archive_bundle_key is not null;

create or replace function public.geomacro_next_cold_observation_rows_v1(
  p_limit integer default 100
)
returns table(observation jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_limit < 1 or p_limit > 100 then
    raise exception 'COLD_OBSERVATION_LIMIT_OUT_OF_RANGE';
  end if;
  return query
  select to_jsonb(o)
  from public.live_external_observations o
  where o.ingested_at < now() - interval '7 days'
    and o.raw_payload is null
    and o.archive_bundle_key is not null
    and o.archive_bundle_sha256 ~ '^[a-f0-9]{64}$'
    and o.archive_member_sha256 ~ '^[a-f0-9]{64}$'
  order by o.ingested_at asc, o.observation_id asc
  limit p_limit;
end;
$$;

revoke all on function public.geomacro_next_cold_observation_rows_v1(integer) from public, anon, authenticated;
grant execute on function public.geomacro_next_cold_observation_rows_v1(integer) to service_role;

create or replace function public.geomacro_delete_verified_cold_observation_rows_v1(
  p_cutoff timestamptz,
  p_items jsonb
)
returns table(observation_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  v_id text;
  v_raw_hash text;
  v_normalized_hash text;
  v_ingested timestamptz;
  deleted_id text;
begin
  if p_cutoff > now() - interval '7 days'
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 100 then
    raise exception 'COLD_OBSERVATION_DELETE_ARGS_INVALID';
  end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    v_id := item->>'observation_id';
    v_raw_hash := item->>'raw_hash';
    v_normalized_hash := item->>'normalized_hash';
    begin
      v_ingested := (item->>'ingested_at')::timestamptz;
    exception when others then
      raise exception 'COLD_OBSERVATION_DELETE_ITEM_INVALID';
    end;
    if length(v_id) < 8 or v_raw_hash !~ '^[a-f0-9]{64}$' or v_normalized_hash !~ '^[a-f0-9]{64}$' then
      raise exception 'COLD_OBSERVATION_DELETE_ITEM_INVALID';
    end if;

    delete from public.live_external_observations o
    where o.observation_id = v_id
      and o.raw_hash = v_raw_hash
      and o.normalized_hash = v_normalized_hash
      and o.ingested_at = v_ingested
      and o.ingested_at < p_cutoff
      and o.raw_payload is null
      and o.archive_bundle_key is not null
      and o.archive_bundle_sha256 ~ '^[a-f0-9]{64}$'
      and o.archive_member_sha256 ~ '^[a-f0-9]{64}$'
    returning o.observation_id into deleted_id;

    if deleted_id is null then
      raise exception 'COLD_OBSERVATION_SOURCE_CHANGED:%', v_id;
    end if;
    observation_id := deleted_id;
    return next;
    deleted_id := null;
  end loop;
end;
$$;

revoke all on function public.geomacro_delete_verified_cold_observation_rows_v1(timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.geomacro_delete_verified_cold_observation_rows_v1(timestamptz,jsonb) to service_role;
