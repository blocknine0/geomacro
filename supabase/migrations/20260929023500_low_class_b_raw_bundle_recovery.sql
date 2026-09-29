alter table public.live_raw_source_snapshots
  add column if not exists archive_bundle_key text,
  add column if not exists archive_bundle_sha256 text,
  add column if not exists archive_member_sha256 text;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'live_raw_source_snapshots_archive_bundle_shape_check'
      and conrelid = 'public.live_raw_source_snapshots'::regclass
  ) then
    alter table public.live_raw_source_snapshots
      add constraint live_raw_source_snapshots_archive_bundle_shape_check check (
        (archive_bundle_key is null and archive_bundle_sha256 is null and archive_member_sha256 is null)
        or
        (archive_bundle_key ~ '^geomacro-evidence/v1/raw-bundles/[0-9]{8}T[0-9]{6}Z-[0-9a-f]-[0-9a-f-]{36}\.json\.gz$'
         and archive_bundle_sha256 ~ '^[a-f0-9]{64}$'
         and archive_member_sha256 ~ '^[a-f0-9]{64}$')
      );
  end if;
end $$;

create or replace function public.geomacro_mark_verified_raw_bundle(
  p_bundle_key text,
  p_bundle_sha256 text,
  p_items jsonb
)
returns table(snapshot_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  v_id uuid;
  v_path text;
  v_payload_hash text;
  v_member_hash text;
  marked uuid;
begin
  if p_bundle_key !~ '^geomacro-evidence/v1/raw-bundles/[0-9]{8}T[0-9]{6}Z-[0-9a-f]-[0-9a-f-]{36}\.json\.gz$'
     or p_bundle_sha256 !~ '^[a-f0-9]{64}$'
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 100 then
    raise exception 'RAW_BUNDLE_MARK_ARGS_INVALID';
  end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_id := (item->>'snapshot_id')::uuid;
    exception when others then
      raise exception 'RAW_BUNDLE_MARK_ITEM_INVALID';
    end;
    v_path := item->>'object_path';
    v_payload_hash := item->>'content_sha256';
    v_member_hash := item->>'member_compressed_sha256';
    if v_path !~ '^raw/v1/[A-Za-z0-9_./-]+\.gz$' or position('..' in v_path) > 0
       or v_payload_hash !~ '^[a-f0-9]{64}$'
       or v_member_hash !~ '^[a-f0-9]{64}$' then
      raise exception 'RAW_BUNDLE_MARK_ITEM_INVALID';
    end if;

    update public.live_raw_source_snapshots s
       set archive_bundle_key = p_bundle_key,
           archive_bundle_sha256 = p_bundle_sha256,
           archive_member_sha256 = v_member_hash
     where s.snapshot_id = v_id
       and s.storage_bucket = 'geomacro-live-intelligence'
       and s.object_path = v_path
       and s.content_sha256 = v_payload_hash
       and s.archive_bundle_key is null
       and exists (
         select 1 from storage.objects o
          where o.bucket_id = s.storage_bucket and o.name = s.object_path
       )
    returning s.snapshot_id into marked;

    if marked is null then
      raise exception 'RAW_BUNDLE_SOURCE_CHANGED:%', v_id;
    end if;
    snapshot_id := marked;
    return next;
    marked := null;
  end loop;
end;
$$;
revoke all on function public.geomacro_mark_verified_raw_bundle(text,text,jsonb) from public, anon, authenticated;
grant execute on function public.geomacro_mark_verified_raw_bundle(text,text,jsonb) to service_role;
