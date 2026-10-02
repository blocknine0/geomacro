create or replace function public.geomacro_next_raw_bundle_source_orphans(p_limit integer default 100)
returns table(snapshot_id uuid,storage_bucket text,object_path text,byte_count bigint,content_sha256 text,fetched_at timestamptz,archive_bundle_key text,archive_bundle_sha256 text,archive_member_sha256 text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_limit < 1 or p_limit > 100 then raise exception 'RAW_ORPHAN_LIMIT_OUT_OF_RANGE'; end if;
  return query
  select s.snapshot_id,s.storage_bucket,s.object_path,s.byte_count::bigint,s.content_sha256,s.fetched_at,s.archive_bundle_key,s.archive_bundle_sha256,s.archive_member_sha256
  from public.live_raw_source_snapshots s
  join storage.objects o on o.bucket_id=s.storage_bucket and o.name=s.object_path
  where s.storage_bucket='geomacro-live-intelligence'
    and s.object_path like 'raw/v1/%'
    and s.archive_bundle_key is not null
    and s.archive_bundle_sha256 ~ '^[a-f0-9]{64}$'
    and s.archive_member_sha256 ~ '^[a-f0-9]{64}$'
  order by s.fetched_at asc,s.snapshot_id asc
  limit p_limit;
end;
$$;
revoke all on function public.geomacro_next_raw_bundle_source_orphans(integer) from public,anon,authenticated;
grant execute on function public.geomacro_next_raw_bundle_source_orphans(integer) to service_role;
