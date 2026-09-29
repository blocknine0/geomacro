create or replace function public.geomacro_clear_verified_gro_bundle_v1(
  p_bundle_key text,
  p_bundle_sha256 text,
  p_items jsonb
)
returns table(object_id text)
language plpgsql
security definer
set search_path=''
as $$
declare
  item jsonb;
  v_id text;
  v_payload jsonb;
  v_payload_hash text;
  v_archive_sha text;
  cleared_id text;
begin
  if p_bundle_key !~ '^geomacro-evidence/v1/gro-bundles/[0-9]{8}T[0-9]{6}Z-[0-9a-f]-[0-9a-f-]{36}\.json\.gz$'
     or p_bundle_sha256 !~ '^[a-f0-9]{64}$'
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 50 then
    raise exception 'GRO_BUNDLE_CLEAR_V1_ARGS_INVALID';
  end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    v_id := item->>'object_id';
    v_payload := item->'payload';
    v_payload_hash := item->>'payload_hash';
    v_archive_sha := item->>'archive_sha256';

    if v_id !~ '^gro_[A-Za-z0-9_]+$'
       or v_payload is null or v_payload='null'::jsonb
       or v_payload_hash !~ '^[a-f0-9]{64}$'
       or v_archive_sha !~ '^[a-f0-9]{64}$' then
      raise exception 'GRO_BUNDLE_CLEAR_V1_ITEM_INVALID';
    end if;

    update public.geomacro_risk_objects g
       set payload=null,
           archive_key='risk-object-archive/v1/' || v_id || '.json.gz',
           archive_sha256=v_archive_sha,
           archive_bundle_key=p_bundle_key,
           archive_bundle_sha256=p_bundle_sha256
     where g.object_id=v_id
       and g.payload is not null
       and g.payload=v_payload
       and g.payload_hash=v_payload_hash
       and g.signature is not null
       and g.expires_at < now() - interval '6 hours'
       and g.archive_key is null
       and g.archive_bundle_key is null
     returning g.object_id into cleared_id;

    if cleared_id is null then
      raise exception 'GRO_BUNDLE_SOURCE_CHANGED:%',v_id;
    end if;
    object_id:=cleared_id;
    return next;
    cleared_id:=null;
  end loop;
end;
$$;

revoke all on function public.geomacro_clear_verified_gro_bundle_v1(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.geomacro_clear_verified_gro_bundle_v1(text,text,jsonb) to service_role;
