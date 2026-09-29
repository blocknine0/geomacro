do $$ begin
  if to_regclass('public.geomacro_risk_objects') is not null then
    alter table public.geomacro_risk_objects
      add column if not exists archive_bundle_key text,
      add column if not exists archive_bundle_sha256 text;
    if not exists (
      select 1 from pg_constraint where conname='geomacro_risk_objects_archive_bundle_shape_check'
        and conrelid=to_regclass('public.geomacro_risk_objects')
    ) then
      alter table public.geomacro_risk_objects add constraint geomacro_risk_objects_archive_bundle_shape_check check (
        (archive_bundle_key is null and archive_bundle_sha256 is null)
        or
        (archive_bundle_key ~ '^geomacro-evidence/v1/gro-bundles/[0-9]{8}T[0-9]{6}Z-[0-9a-f]-[0-9a-f-]{36}\.json\.gz$'
         and archive_bundle_sha256 ~ '^[a-f0-9]{64}$')
      );
    end if;
  end if;
end $$;

create or replace function public.geomacro_externalize_verified_gro_bundle(
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
  v_signature text;
  v_signing_key_id text;
  v_member_hash text;
  v_pointer text;
  updated_id text;
begin
  if p_bundle_key !~ '^geomacro-evidence/v1/gro-bundles/[0-9]{8}T[0-9]{6}Z-[0-9a-f]-[0-9a-f-]{36}\.json\.gz$'
     or p_bundle_sha256 !~ '^[a-f0-9]{64}$'
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 100 then
    raise exception 'GRO_BUNDLE_EXTERNALIZE_ARGS_INVALID';
  end if;
  if to_regclass('public.geomacro_risk_objects') is null then
    raise exception 'GRO_BUNDLE_SOURCE_TABLE_UNAVAILABLE';
  end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    v_id := item->>'object_id';
    v_payload := item->'payload';
    v_payload_hash := item->>'payload_hash';
    v_signature := item->>'signature';
    v_signing_key_id := item->>'signing_key_id';
    v_member_hash := item->>'member_compressed_sha256';
    if v_id !~ '^gro_[A-Za-z0-9_]+$' or v_payload is null or v_payload='null'::jsonb
       or v_payload_hash !~ '^[a-f0-9]{64}$' or coalesce(length(v_signature),0)<16
       or coalesce(length(v_signing_key_id),0)<1 or v_member_hash !~ '^[a-f0-9]{64}$' then
      raise exception 'GRO_BUNDLE_EXTERNALIZE_ITEM_INVALID';
    end if;
    v_pointer := 'risk-object-archive/v1/' || v_id || '.json.gz';

    execute $sql$
      update public.geomacro_risk_objects g
         set payload=null,
             archive_key=$1,
             archive_sha256=$2,
             archive_bundle_key=$3,
             archive_bundle_sha256=$4
       where g.object_id=$5
         and g.payload=$6
         and g.payload_hash=$7
         and g.signature=$8
         and g.signing_key_id=$9
         and g.archive_key is null
         and g.archive_bundle_key is null
         and not exists (
           select 1 from storage.objects o
            where o.bucket_id='geomacro-live-intelligence' and o.name=$1
         )
      returning g.object_id
    $sql$ into updated_id using v_pointer,v_member_hash,p_bundle_key,p_bundle_sha256,v_id,v_payload,v_payload_hash,v_signature,v_signing_key_id;

    if updated_id is null then raise exception 'GRO_BUNDLE_SOURCE_CHANGED:%',v_id; end if;
    object_id:=updated_id; return next; updated_id:=null;
  end loop;
end;
$$;
revoke all on function public.geomacro_externalize_verified_gro_bundle(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.geomacro_externalize_verified_gro_bundle(text,text,jsonb) to service_role;
