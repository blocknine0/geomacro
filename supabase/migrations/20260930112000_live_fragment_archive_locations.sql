-- Immutable sidecar locations for archived live evidence fragments.
-- The sealed live_fragment_manifest remains untouched.

create table if not exists public.live_fragment_archive_locations (
  fragment_id uuid primary key
    references public.live_fragment_manifest(id)
    on delete restrict,

  archive_bucket text not null
    check (archive_bucket = 'geomacro-private-archive'),

  archive_object_path text not null unique
    check (archive_object_path ~ '^geomacro-evidence/v1/live/v1/[A-Za-z0-9_./-]+\.ndjson\.gz$'),

  compressed_sha256 text not null
    check (compressed_sha256 ~ '^[0-9a-f]{64}$'),

  compressed_bytes bigint not null
    check (compressed_bytes >= 0),

  source_bucket text not null
    check (source_bucket = 'geomacro-live-intelligence'),

  source_object_path text not null,

  verified_at timestamptz not null,
  verification_method text not null
    check (verification_method = 'b2-readback-sha256'),

  source_deleted_at timestamptz,
  deletion_proof_key text,

  created_at timestamptz not null default now()
);

create index if not exists live_fragment_archive_locations_verified_idx
  on public.live_fragment_archive_locations(verified_at desc);

alter table public.live_fragment_archive_locations enable row level security;

create or replace function public.prevent_live_fragment_archive_location_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if new.fragment_id is distinct from old.fragment_id
      or new.archive_bucket is distinct from old.archive_bucket
      or new.archive_object_path is distinct from old.archive_object_path
      or new.compressed_sha256 is distinct from old.compressed_sha256
      or new.compressed_bytes is distinct from old.compressed_bytes
      or new.source_bucket is distinct from old.source_bucket
      or new.source_object_path is distinct from old.source_object_path
      or new.verified_at is distinct from old.verified_at
      or new.verification_method is distinct from old.verification_method
      or old.source_deleted_at is not null
      or old.deletion_proof_key is not null
    then
      raise exception 'verified live fragment archive location is immutable';
    end if;

    if new.source_deleted_at is null
      or new.deletion_proof_key is null
      or new.source_deleted_at < old.verified_at
      or new.deletion_proof_key !~ '^geomacro-evidence/v1/index/live-fragments-deleted/[A-Za-z0-9_.-]+\.json$'
    then
      raise exception 'invalid live fragment source deletion proof';
    end if;

    return new;
  end if;

  raise exception 'verified live fragment archive locations cannot be deleted';
end;
$$;

drop trigger if exists live_fragment_archive_location_immutable
  on public.live_fragment_archive_locations;

create trigger live_fragment_archive_location_immutable
before update or delete
on public.live_fragment_archive_locations
for each row
execute function public.prevent_live_fragment_archive_location_mutation();

create or replace function public.geomacro_mark_live_fragment_source_deleted(
  p_fragment_id uuid,
  p_deletion_proof_key text,
  p_deleted_at timestamptz default now()
)
returns public.live_fragment_archive_locations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.live_fragment_archive_locations;
begin
  update public.live_fragment_archive_locations
     set source_deleted_at = p_deleted_at,
         deletion_proof_key = p_deletion_proof_key
   where fragment_id = p_fragment_id
     and source_deleted_at is null
     and deletion_proof_key is null
  returning * into v_row;

  if v_row.fragment_id is null then
    raise exception 'archive location missing or source deletion already marked';
  end if;

  return v_row;
end;
$$;

revoke all on function public.geomacro_mark_live_fragment_source_deleted(uuid, text, timestamptz) from public;
revoke all on function public.geomacro_mark_live_fragment_source_deleted(uuid, text, timestamptz) from anon;
revoke all on function public.geomacro_mark_live_fragment_source_deleted(uuid, text, timestamptz) from authenticated;
grant execute on function public.geomacro_mark_live_fragment_source_deleted(uuid, text, timestamptz) to service_role;

comment on table public.live_fragment_archive_locations is
  'Append-only verified B2 archive sidecar for immutable live_fragment_manifest rows; source deletion is recorded only after verified B2 readback and Storage API removal.';
