create or replace function public.geomacro_next_raw_storage_candidates(p_limit integer default 25)
returns table(snapshot_id uuid,storage_bucket text,object_path text,byte_count bigint,content_sha256 text,fetched_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_limit < 1 or p_limit > 100 then raise exception 'RAW_ARCHIVE_LIMIT_OUT_OF_RANGE'; end if;
  return query
  select s.snapshot_id,s.storage_bucket,s.object_path,s.byte_count::bigint,s.content_sha256,s.fetched_at
  from public.live_raw_source_snapshots s
  join storage.objects o on o.bucket_id=s.storage_bucket and o.name=s.object_path
  where s.storage_bucket='geomacro-live-intelligence'
    and s.object_path like 'raw/v1/%'
    and s.archive_bundle_key is null
    and s.fetched_at < now() - interval '72 hours'
  order by s.fetched_at asc,s.snapshot_id asc
  limit p_limit;
end;
$$;

create or replace function public.geomacro_next_raw_storage_candidates_shard(p_suffix text,p_limit integer default 25)
returns table(snapshot_id uuid,storage_bucket text,object_path text,byte_count bigint,content_sha256 text,fetched_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_suffix !~ '^[0-9a-f]$' then raise exception 'RAW_ARCHIVE_SUFFIX_INVALID'; end if;
  if p_limit < 1 or p_limit > 100 then raise exception 'RAW_ARCHIVE_LIMIT_OUT_OF_RANGE'; end if;
  return query
  select s.snapshot_id,s.storage_bucket,s.object_path,s.byte_count::bigint,s.content_sha256,s.fetched_at
  from public.live_raw_source_snapshots s
  join storage.objects o on o.bucket_id=s.storage_bucket and o.name=s.object_path
  where s.storage_bucket='geomacro-live-intelligence'
    and s.object_path like 'raw/v1/%'
    and s.archive_bundle_key is null
    and s.fetched_at < now() - interval '72 hours'
    and right(s.snapshot_id::text,1)=p_suffix
  order by s.fetched_at asc,s.snapshot_id asc
  limit p_limit;
end;
$$;
