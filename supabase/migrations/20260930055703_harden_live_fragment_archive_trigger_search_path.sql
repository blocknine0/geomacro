create or replace function public.prevent_live_fragment_archive_location_mutation()
returns trigger
language plpgsql
set search_path = public
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
      or old.deletion_proof_key is not null then
      raise exception 'verified live fragment archive location is immutable';
    end if;
    if new.source_deleted_at is null
      or new.deletion_proof_key is null
      or new.source_deleted_at < old.verified_at
      or new.deletion_proof_key !~ '^geomacro-evidence/v1/index/live-fragments-deleted/[A-Za-z0-9_.-]+\.json$' then
      raise exception 'invalid live fragment source deletion proof';
    end if;
    return new;
  end if;
  raise exception 'verified live fragment archive locations cannot be deleted';
end;
$$;
