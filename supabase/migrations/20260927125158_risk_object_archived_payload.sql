-- Signed GRO metadata remains queryable; only expired payload bytes may move
-- to verified private Storage. Service-role operators perform the move.
alter table public.geomacro_risk_objects
  add column if not exists archive_key text,
  add column if not exists archive_sha256 text;

alter table public.geomacro_risk_objects
  alter column payload drop not null;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'geomacro_risk_objects_archive_shape_check'
      and conrelid = 'public.geomacro_risk_objects'::regclass
  ) then
    alter table public.geomacro_risk_objects
      add constraint geomacro_risk_objects_archive_shape_check
      check (
        (payload is not null and archive_key is null and archive_sha256 is null)
        or
        (payload is null and archive_key = 'risk-object-archive/v1/' || object_id || '.json.gz'
          and archive_sha256 ~ '^[a-f0-9]{64}$' and payload_hash ~ '^[a-f0-9]{64}$')
      );
  end if;
end $$;

create or replace function public.prevent_geomacro_risk_object_mutation()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE'
    and old.payload is not null and new.payload is null
    and old.archive_key is null and old.archive_sha256 is null
    and old.payload_hash is not null and old.signature is not null
    and old.expires_at < now() - interval '72 hours'
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

comment on column public.geomacro_risk_objects.archive_key is
  'Private Supabase Storage gzip path for an expired signed payload. The row retains signed metadata and historical ordering.';
