-- Allow service-side signed GRO B2 archive after a six-hour post-expiry buffer.
-- Immutable metadata, exact pointer, hash shape, and restoration checks remain.
create or replace function public.prevent_geomacro_risk_object_mutation()
returns trigger language plpgsql as $$
begin
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
