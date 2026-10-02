alter table public.live_external_observations
  add column if not exists archive_bundle_key text,
  add column if not exists archive_bundle_sha256 text,
  add column if not exists archive_member_sha256 text;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname='live_external_observations_archive_bundle_shape_check'
      and conrelid='public.live_external_observations'::regclass
  ) then
    alter table public.live_external_observations add constraint live_external_observations_archive_bundle_shape_check check (
      (archive_bundle_key is null and archive_bundle_sha256 is null and archive_member_sha256 is null)
      or
      (archive_bundle_key ~ '^geomacro-evidence/v1/observation-bundles/[0-9]{8}T[0-9]{6}Z-[0-9a-f]-[0-9a-f-]{36}\.json\.gz$'
       and archive_bundle_sha256 ~ '^[a-f0-9]{64}$'
       and archive_member_sha256 ~ '^[a-f0-9]{64}$')
    );
  end if;
end $$;

create or replace function public.geomacro_clear_verified_observation_bundle_v2(
  p_bundle_key text,
  p_bundle_sha256 text,
  p_items jsonb
)
returns table(observation_id text)
language plpgsql
security definer
set search_path=''
as $$
declare
  item jsonb;
  v_id text;
  v_hash text;
  v_payload jsonb;
  v_member_hash text;
  cleared_id text;
begin
  if p_bundle_key !~ '^geomacro-evidence/v1/observation-bundles/[0-9]{8}T[0-9]{6}Z-[0-9a-f]-[0-9a-f-]{36}\.json\.gz$'
     or p_bundle_sha256 !~ '^[a-f0-9]{64}$'
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 100 then
    raise exception 'OBS_BUNDLE_CLEAR_V2_ARGS_INVALID';
  end if;
  for item in select value from jsonb_array_elements(p_items)
  loop
    v_id := item->>'observation_id';
    v_hash := item->>'raw_hash';
    v_payload := item->'raw_payload';
    v_member_hash := item->>'payload_sha256';
    if coalesce(length(v_id),0)<1 or length(v_id)>512 or v_hash !~ '^[a-f0-9]{64}$'
       or v_payload is null or v_payload='null'::jsonb or v_member_hash !~ '^[a-f0-9]{64}$' then
      raise exception 'OBS_BUNDLE_CLEAR_V2_ITEM_INVALID';
    end if;
    update public.live_external_observations o
       set raw_payload=null,
           archive_bundle_key=p_bundle_key,
           archive_bundle_sha256=p_bundle_sha256,
           archive_member_sha256=v_member_hash
     where o.observation_id=v_id
       and o.raw_hash=v_hash
       and o.raw_payload is not null
       and o.raw_payload=v_payload
       and o.archive_bundle_key is null
    returning o.observation_id into cleared_id;
    if cleared_id is null then raise exception 'OBS_BUNDLE_SOURCE_CHANGED:%',v_id; end if;
    observation_id:=cleared_id; return next; cleared_id:=null;
  end loop;
end;
$$;
revoke all on function public.geomacro_clear_verified_observation_bundle_v2(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.geomacro_clear_verified_observation_bundle_v2(text,text,jsonb) to service_role;
