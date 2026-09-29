-- LIVE PRODUCTION CONTRACT
-- Applied to Supabase project ldpwajisioljyjtojvfx.
-- Kept under scripts/ops rather than supabase/migrations while the production
-- coverage workflow still auto-runs on migration-path changes. This avoids a
-- quota-saving change triggering a heavy production refresh.
-- Never delete storage.objects directly with SQL.

create or replace function public.geomacro_free_tier_budget_state()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'database_bytes', pg_database_size(current_database()),
    'target_bytes', 367001600,
    'warn_bytes', 419430400,
    'freeze_bytes', 471859200,
    'mode', case
      when pg_database_size(current_database()) >= 471859200 then 'freeze'
      when pg_database_size(current_database()) >= 419430400 then 'warn'
      else 'normal'
    end,
    'bulk_write_allowed', pg_database_size(current_database()) < 471859200
  );
$$;

revoke all on function public.geomacro_free_tier_budget_state() from public;
revoke all on function public.geomacro_free_tier_budget_state() from anon;
revoke all on function public.geomacro_free_tier_budget_state() from authenticated;
grant execute on function public.geomacro_free_tier_budget_state() to service_role;

create or replace function public.geomacro_next_raw_storage_candidates(p_limit integer default 25)
returns table(
  snapshot_id uuid,
  storage_bucket text,
  object_path text,
  byte_count bigint,
  content_sha256 text,
  fetched_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_limit < 1 or p_limit > 100 then
    raise exception 'RAW_ARCHIVE_LIMIT_OUT_OF_RANGE';
  end if;

  return query
  select s.snapshot_id,
         s.storage_bucket,
         s.object_path,
         s.byte_count::bigint,
         s.content_sha256,
         s.fetched_at
  from public.live_raw_source_snapshots s
  join storage.objects o
    on o.bucket_id = s.storage_bucket
   and o.name = s.object_path
  where s.storage_bucket = 'geomacro-live-intelligence'
    and s.object_path like 'raw/v1/%'
    and s.archive_bundle_key is null
    and s.fetched_at < now() - interval '72 hours'
  order by s.fetched_at asc, s.snapshot_id asc
  limit p_limit;
end;
$$;

revoke all on function public.geomacro_next_raw_storage_candidates(integer) from public;
revoke all on function public.geomacro_next_raw_storage_candidates(integer) from anon;
revoke all on function public.geomacro_next_raw_storage_candidates(integer) from authenticated;
grant execute on function public.geomacro_next_raw_storage_candidates(integer) to service_role;

create index if not exists live_raw_source_snapshots_b2_archive_shard_idx
on public.live_raw_source_snapshots ((right(snapshot_id::text, 1)), fetched_at)
where storage_bucket = 'geomacro-live-intelligence'
  and object_path like 'raw/v1/%';

create or replace function public.geomacro_next_raw_storage_candidates_shard(
  p_suffix text,
  p_limit integer default 25
)
returns table(
  snapshot_id uuid,
  storage_bucket text,
  object_path text,
  byte_count bigint,
  content_sha256 text,
  fetched_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_suffix !~ '^[0-9a-f]$' then
    raise exception 'RAW_ARCHIVE_SUFFIX_INVALID';
  end if;
  if p_limit < 1 or p_limit > 100 then
    raise exception 'RAW_ARCHIVE_LIMIT_OUT_OF_RANGE';
  end if;

  return query
  select s.snapshot_id,
         s.storage_bucket,
         s.object_path,
         s.byte_count::bigint,
         s.content_sha256,
         s.fetched_at
  from public.live_raw_source_snapshots s
  join storage.objects o
    on o.bucket_id = s.storage_bucket
   and o.name = s.object_path
  where s.storage_bucket = 'geomacro-live-intelligence'
    and s.object_path like 'raw/v1/%'
    and s.archive_bundle_key is null
    and s.fetched_at < now() - interval '72 hours'
    and right(s.snapshot_id::text, 1) = p_suffix
  order by s.fetched_at asc, s.snapshot_id asc
  limit p_limit;
end;
$$;

revoke all on function public.geomacro_next_raw_storage_candidates_shard(text, integer) from public;
revoke all on function public.geomacro_next_raw_storage_candidates_shard(text, integer) from anon;
revoke all on function public.geomacro_next_raw_storage_candidates_shard(text, integer) from authenticated;
grant execute on function public.geomacro_next_raw_storage_candidates_shard(text, integer) to service_role;

create or replace function public.geomacro_raw_storage_paths_present(p_paths text[])
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(o.name order by o.name), array[]::text[])
  from storage.objects o
  where o.bucket_id = 'geomacro-live-intelligence'
    and o.name = any(p_paths);
$$;

revoke all on function public.geomacro_raw_storage_paths_present(text[]) from public;
revoke all on function public.geomacro_raw_storage_paths_present(text[]) from anon;
revoke all on function public.geomacro_raw_storage_paths_present(text[]) from authenticated;
grant execute on function public.geomacro_raw_storage_paths_present(text[]) to service_role;
