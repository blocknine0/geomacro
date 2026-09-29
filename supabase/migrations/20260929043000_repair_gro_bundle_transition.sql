-- A verified GRO bundle may replace only expired signed payload bytes with
-- immutable B2 pointers. All other edits and deletes remain forbidden.
begin;

alter table public.geomacro_risk_objects
  add column if not exists archive_bundle_key text,
  add column if not exists archive_bundle_sha256 text;

do $$ begin
  if exists (select 1 from public.geomacro_risk_objects where archive_bundle_key is not null) then
    raise exception 'GRO_BUNDLE_REPAIR_REQUIRES_REVIEW_OF_EXISTING_POINTERS';
  end if;
end $$;

alter table public.geomacro_risk_objects
  drop constraint if exists geomacro_risk_objects_archive_bundle_shape_check;
alter table public.geomacro_risk_objects
  add constraint geomacro_risk_objects_archive_bundle_shape_check check (
    (archive_bundle_key is null and archive_bundle_sha256 is null)
    or (archive_bundle_key ~ '^geomacro-evidence/v1/gro-bundles/[0-9]{8}T[0-9]{6}Z-[0-9a-f]-[0-9a-f-]{36}\.json\.gz$'
      and archive_bundle_sha256 ~ '^[a-f0-9]{64}$')
  );

create or replace function public.prevent_geomacro_risk_object_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE'
    and old.payload is not null and new.payload is null
    and old.archive_key is null and old.archive_sha256 is null
    and old.archive_bundle_key is null and old.archive_bundle_sha256 is null
    and old.payload_hash is not null and old.signature is not null
    and old.expires_at < now() - interval '6 hours'
    and new.archive_key = 'risk-object-archive/v1/' || old.object_id || '.json.gz'
    and new.archive_sha256 ~ '^[a-f0-9]{64}$'
    and new.archive_bundle_key ~ '^geomacro-evidence/v1/gro-bundles/[0-9]{8}T[0-9]{6}Z-[0-9a-f]-[0-9a-f-]{36}\.json\.gz$'
    and new.archive_bundle_sha256 ~ '^[a-f0-9]{64}$'
    and (to_jsonb(new) - 'payload' - 'archive_key' - 'archive_sha256' - 'archive_bundle_key' - 'archive_bundle_sha256') =
        (to_jsonb(old) - 'payload' - 'archive_key' - 'archive_sha256' - 'archive_bundle_key' - 'archive_bundle_sha256')
  then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and old.payload is null and new.payload is not null
    and old.archive_bundle_key is not null and old.archive_bundle_sha256 is not null
    and old.archive_key = 'risk-object-archive/v1/' || old.object_id || '.json.gz'
    and new.archive_key is null and new.archive_sha256 is null
    and new.archive_bundle_key is null and new.archive_bundle_sha256 is null
    and new.payload->>'object_id' = old.object_id
    and new.payload->'integrity'->>'payload_hash' = old.payload_hash
    and (to_jsonb(new) - 'payload' - 'archive_key' - 'archive_sha256' - 'archive_bundle_key' - 'archive_bundle_sha256') =
        (to_jsonb(old) - 'payload' - 'archive_key' - 'archive_sha256' - 'archive_bundle_key' - 'archive_bundle_sha256')
  then
    return new;
  end if;
  -- Preserve the existing single-object transition and recovery contract.
  if tg_op = 'UPDATE'
    and old.payload is not null and new.payload is null
    and old.archive_key is null and old.archive_sha256 is null
    and old.payload_hash is not null and old.signature is not null
    and old.expires_at < now() - interval '6 hours'
    and new.archive_key = 'risk-object-archive/v1/' || old.object_id || '.json.gz'
    and new.archive_sha256 ~ '^[a-f0-9]{64}$'
    and (to_jsonb(new) - 'payload' - 'archive_key' - 'archive_sha256') =
        (to_jsonb(old) - 'payload' - 'archive_key' - 'archive_sha256')
  then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and old.payload is null and new.payload is not null
    and old.archive_key = 'risk-object-archive/v1/' || old.object_id || '.json.gz'
    and new.archive_key is null and new.archive_sha256 is null
    and new.payload->>'object_id' = old.object_id
    and new.payload->'integrity'->>'payload_hash' = old.payload_hash
    and (to_jsonb(new) - 'payload' - 'archive_key' - 'archive_sha256') =
        (to_jsonb(old) - 'payload' - 'archive_key' - 'archive_sha256')
  then
    return new;
  end if;
  raise exception 'Geomacro Risk Objects are immutable';
end;
$$;

commit;
