-- Production B2 recovery candidate selection contract.
-- Applied to Supabase project ldpwajisioljyjtojvfx.
-- Keeps candidate selection index-backed and service-role-only.

create index if not exists live_external_observations_b2_archive_shard_idx
on public.live_external_observations ((right(lower(observation_id), 1)), ingested_at asc)
where raw_payload is not null;

create index if not exists geomacro_risk_objects_b2_archive_shard_idx
on public.geomacro_risk_objects ((right(lower(object_id), 1)), generated_at asc)
where archive_key is null and payload is not null and signature is not null;

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

-- Clear a fully verified observation bundle in one transaction. Every row must
-- still have the exact JSONB payload and hash seen before B2 upload/readback;
-- otherwise the whole call fails and no payload is cleared.
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

create or replace function public.geomacro_next_gro_archive_candidates(p_suffix text, p_signing_key_id text, p_limit integer default 100)
returns table(object_id text, payload jsonb, payload_hash text, signature text, signing_key_id text, expires_at timestamptz, archive_key text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_suffix !~ '^[0-9a-f]$' or p_limit < 1 or p_limit > 100 or coalesce(length(p_signing_key_id),0)=0 then
    raise exception 'GRO_ARCHIVE_CANDIDATE_ARGS_INVALID';
  end if;
  return query
  select g.object_id, g.payload, g.payload_hash, g.signature, g.signing_key_id, g.expires_at, g.archive_key
  from public.geomacro_risk_objects g
  where g.archive_key is null
    and g.payload is not null
    and g.signature is not null
    and g.signing_key_id = p_signing_key_id
    and g.expires_at < now() - interval '6 hours'
    and right(lower(g.object_id), 1) = p_suffix
  order by g.generated_at asc
  limit p_limit;
end;
$$;
revoke all on function public.geomacro_next_gro_archive_candidates(text, text, integer) from public, anon, authenticated;
grant execute on function public.geomacro_next_gro_archive_candidates(text, text, integer) to service_role;
