-- Transactional hot-row compaction/restore for B2-verified structured-event bundles.
-- The archive bytes are verified by the caller before either RPC is invoked.
-- These RPCs only swap structured_payload between the exact expected full JSONB
-- and a bounded v2 bundle pointer; all other event columns remain untouched.

create or replace function public.geomacro_compact_structured_event_payload_bundle(
  p_updates jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_id uuid;
  v_last_seen_at timestamptz;
  v_expected_payload jsonb;
  v_compact_payload jsonb;
  v_current_payload jsonb;
  v_current_last_seen_at timestamptz;
  v_archive jsonb;
  v_count integer := 0;
begin
  if jsonb_typeof(p_updates) <> 'array'
     or jsonb_array_length(p_updates) < 1
     or jsonb_array_length(p_updates) > 1000 then
    raise exception 'invalid structured event bundle update batch';
  end if;

  -- Validate and lock every source row before making any update. A single
  -- mismatch aborts the function transaction, so partial compaction is impossible.
  for v_item in select value from jsonb_array_elements(p_updates)
  loop
    if jsonb_typeof(v_item) <> 'object'
       or jsonb_typeof(v_item->'expected_payload') <> 'object'
       or jsonb_typeof(v_item->'compact_payload') <> 'object' then
      raise exception 'invalid structured event bundle update item';
    end if;

    v_id := (v_item->>'id')::uuid;
    v_last_seen_at := (v_item->>'last_seen_at')::timestamptz;
    v_expected_payload := v_item->'expected_payload';
    v_compact_payload := v_item->'compact_payload';
    v_archive := v_compact_payload->'_archive';

    if jsonb_typeof(v_archive) <> 'object'
       or v_archive->>'v' <> '2'
       or v_archive->>'t' <> 'bundle-v1'
       or v_archive->>'m' <> v_id::text
       or coalesce(v_archive->>'k','') !~ '^geomacro-evidence/v1/structured-event-bundles/[0-9]{4}-[0-9]{2}-[0-9]{2}/[0-9a-f]{64}\.json\.gz$'
       or coalesce(v_archive->>'a','') !~ '^[0-9a-f]{64}$'
       or coalesce(v_archive->>'p','') !~ '^[0-9a-f]{64}$' then
      raise exception 'invalid structured event bundle pointer';
    end if;

    select structured_payload, last_seen_at
      into v_current_payload, v_current_last_seen_at
      from public.live_structured_events
     where id = v_id
     for update;

    if not found
       or v_current_last_seen_at is distinct from v_last_seen_at
       or v_current_payload is distinct from v_expected_payload then
      raise exception 'structured event source changed before bundle compaction';
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_updates)
  loop
    v_id := (v_item->>'id')::uuid;
    v_compact_payload := v_item->'compact_payload';

    update public.live_structured_events
       set structured_payload = v_compact_payload
     where id = v_id;

    if not found then
      raise exception 'structured event bundle compaction update failed';
    end if;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.geomacro_restore_structured_event_payload_bundle(
  p_updates jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_id uuid;
  v_last_seen_at timestamptz;
  v_expected_pointer jsonb;
  v_restore_payload jsonb;
  v_current_payload jsonb;
  v_current_last_seen_at timestamptz;
  v_archive jsonb;
  v_count integer := 0;
begin
  if jsonb_typeof(p_updates) <> 'array'
     or jsonb_array_length(p_updates) < 1
     or jsonb_array_length(p_updates) > 1000 then
    raise exception 'invalid structured event bundle restore batch';
  end if;

  -- Lock and verify every pointer before restoring any full payload.
  for v_item in select value from jsonb_array_elements(p_updates)
  loop
    if jsonb_typeof(v_item) <> 'object'
       or jsonb_typeof(v_item->'expected_pointer') <> 'object'
       or jsonb_typeof(v_item->'restore_payload') <> 'object' then
      raise exception 'invalid structured event bundle restore item';
    end if;

    v_id := (v_item->>'id')::uuid;
    v_last_seen_at := (v_item->>'last_seen_at')::timestamptz;
    v_expected_pointer := v_item->'expected_pointer';
    v_restore_payload := v_item->'restore_payload';
    v_archive := v_expected_pointer->'_archive';

    if jsonb_typeof(v_archive) <> 'object'
       or v_archive->>'v' <> '2'
       or v_archive->>'t' <> 'bundle-v1'
       or v_archive->>'m' <> v_id::text
       or coalesce(v_archive->>'k','') !~ '^geomacro-evidence/v1/structured-event-bundles/[0-9]{4}-[0-9]{2}-[0-9]{2}/[0-9a-f]{64}\.json\.gz$'
       or coalesce(v_archive->>'a','') !~ '^[0-9a-f]{64}$'
       or coalesce(v_archive->>'p','') !~ '^[0-9a-f]{64}$' then
      raise exception 'invalid structured event bundle restore pointer';
    end if;

    select structured_payload, last_seen_at
      into v_current_payload, v_current_last_seen_at
      from public.live_structured_events
     where id = v_id
     for update;

    if not found
       or v_current_last_seen_at is distinct from v_last_seen_at
       or v_current_payload is distinct from v_expected_pointer then
      raise exception 'structured event pointer changed before bundle restore';
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_updates)
  loop
    v_id := (v_item->>'id')::uuid;
    v_restore_payload := v_item->'restore_payload';

    update public.live_structured_events
       set structured_payload = v_restore_payload
     where id = v_id;

    if not found then
      raise exception 'structured event bundle restore update failed';
    end if;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.geomacro_compact_structured_event_payload_bundle(jsonb) from public, anon, authenticated;
revoke all on function public.geomacro_restore_structured_event_payload_bundle(jsonb) from public, anon, authenticated;
grant execute on function public.geomacro_compact_structured_event_payload_bundle(jsonb) to service_role;
grant execute on function public.geomacro_restore_structured_event_payload_bundle(jsonb) to service_role;

comment on function public.geomacro_compact_structured_event_payload_bundle(jsonb) is
  'Atomically replaces unchanged old structured-event payloads with B2 bundle-v1 v2 pointers after caller-side full archive verification.';
comment on function public.geomacro_restore_structured_event_payload_bundle(jsonb) is
  'Atomically restores full structured-event payloads when a post-compaction B2 verification fails; exact pointer match is required.';
