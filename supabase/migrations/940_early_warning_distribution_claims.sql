-- =============================================================================
-- Early Warning Distribution Receipt Claim/Finalize Hardening
-- =============================================================================
-- Permanent, idempotent migration:
-- - atomic per-alert/per-channel worker leases
-- - payload binding
-- - bounded attempt accounting
-- - ambiguous-delivery fail-closed handling
-- - service_role-only claim/finalize RPCs
-- - safe convergence when the base receipt table/constraints are partially applied
-- =============================================================================

alter table public.early_warning_distribution_receipts
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists payload_hash text,
  add column if not exists ambiguous_outcome boolean not null default false,
  add column if not exists last_response_code integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'early_warning_distribution_payload_hash_check'
      and conrelid = 'public.early_warning_distribution_receipts'::regclass
  ) then
    alter table public.early_warning_distribution_receipts
      add constraint early_warning_distribution_payload_hash_check
      check (payload_hash is null or payload_hash ~ '^[0-9a-f]{64}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'early_warning_distribution_lease_pair_check'
      and conrelid = 'public.early_warning_distribution_receipts'::regclass
  ) then
    alter table public.early_warning_distribution_receipts
      add constraint early_warning_distribution_lease_pair_check
      check ((lease_token is null) = (lease_expires_at is null));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'early_warning_distribution_response_code_check'
      and conrelid = 'public.early_warning_distribution_receipts'::regclass
  ) then
    alter table public.early_warning_distribution_receipts
      add constraint early_warning_distribution_response_code_check
      check (
        last_response_code is null
        or (last_response_code >= 100 and last_response_code <= 599)
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'early_warning_distribution_published_not_ambiguous_check'
      and conrelid = 'public.early_warning_distribution_receipts'::regclass
  ) then
    alter table public.early_warning_distribution_receipts
      add constraint early_warning_distribution_published_not_ambiguous_check
      check (status <> 'PUBLISHED' or ambiguous_outcome is false);
  end if;
end
$$;

create index if not exists early_warning_distribution_lease_idx
  on public.early_warning_distribution_receipts (lease_expires_at)
  where lease_expires_at is not null;

create or replace function public.claim_early_warning_distribution(
  p_alert_key text,
  p_channel text,
  p_payload_hash text,
  p_lease_seconds integer default 120
)
returns table (
  receipt_id uuid,
  early_warning_alert_id uuid,
  claim_token uuid,
  acquired boolean,
  receipt_status text,
  already_published boolean,
  retry_blocked boolean,
  attempt_count integer
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_alert public.early_warning_alerts%rowtype;
  v_receipt public.early_warning_distribution_receipts%rowtype;
  v_token uuid;
  v_now timestamptz := clock_timestamp();
begin
  if p_alert_key is null or char_length(trim(p_alert_key)) < 8 then
    raise exception 'invalid alert key';
  end if;

  if p_channel not in (
    'telegram','discord','bluesky','mastodon','linkedin','x','rss','webhook','email'
  ) then
    raise exception 'unsupported distribution channel';
  end if;

  if p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid payload hash';
  end if;

  if p_lease_seconds < 30 or p_lease_seconds > 600 then
    raise exception 'lease seconds must be between 30 and 600';
  end if;

  select *
    into v_alert
  from public.early_warning_alerts
  where alert_key = trim(p_alert_key)
    and visibility = 'public'
    and public_eligible is true
    and published_at_utc is not null
    and status in ('WARNING','CRITICAL')
  for share;

  if not found then
    raise exception 'public eligible alert not found';
  end if;

  insert into public.early_warning_distribution_receipts (
    early_warning_alert_id,
    channel,
    idempotency_key,
    payload_hash,
    status
  )
  values (
    v_alert.id,
    p_channel,
    encode(digest(v_alert.alert_key || ':' || p_channel, 'sha256'), 'hex'),
    p_payload_hash,
    'PENDING'
  )
  on conflict (early_warning_alert_id, channel) do nothing;

  select *
    into v_receipt
  from public.early_warning_distribution_receipts
  where early_warning_alert_id = v_alert.id
    and channel = p_channel
  for update;

  if v_receipt.payload_hash is distinct from p_payload_hash then
    return query
      select
        v_receipt.id,
        v_receipt.early_warning_alert_id,
        null::uuid,
        false,
        v_receipt.status,
        v_receipt.status = 'PUBLISHED',
        true,
        v_receipt.attempt_count;
    return;
  end if;

  if v_receipt.status = 'PUBLISHED' then
    return query
      select
        v_receipt.id,
        v_receipt.early_warning_alert_id,
        null::uuid,
        false,
        v_receipt.status,
        true,
        true,
        v_receipt.attempt_count;
    return;
  end if;

  if v_receipt.status = 'SKIPPED' or v_receipt.ambiguous_outcome is true then
    return query
      select
        v_receipt.id,
        v_receipt.early_warning_alert_id,
        null::uuid,
        false,
        v_receipt.status,
        false,
        true,
        v_receipt.attempt_count;
    return;
  end if;

  if v_receipt.lease_expires_at is not null
     and v_receipt.lease_expires_at > v_now then
    return query
      select
        v_receipt.id,
        v_receipt.early_warning_alert_id,
        null::uuid,
        false,
        v_receipt.status,
        false,
        true,
        v_receipt.attempt_count;
    return;
  end if;

  v_token := gen_random_uuid();

  update public.early_warning_distribution_receipts
  set
    lease_token = v_token,
    lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
    attempt_count = attempt_count + 1,
    first_attempt_at = coalesce(first_attempt_at, v_now),
    last_attempt_at = v_now,
    last_error = null,
    last_response_code = null,
    updated_at = v_now
  where id = v_receipt.id
  returning * into v_receipt;

  return query
    select
      v_receipt.id,
      v_receipt.early_warning_alert_id,
      v_token,
      true,
      v_receipt.status,
      false,
      false,
      v_receipt.attempt_count;
end;
$$;

create or replace function public.finalize_early_warning_distribution(
  p_receipt_id uuid,
  p_claim_token uuid,
  p_outcome text,
  p_external_reference text default null,
  p_error text default null,
  p_response_code integer default null
)
returns table (
  receipt_id uuid,
  receipt_status text,
  published_at timestamptz,
  ambiguous_outcome boolean,
  attempt_count integer
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_receipt public.early_warning_distribution_receipts%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_receipt_id is null or p_claim_token is null then
    raise exception 'receipt id and claim token are required';
  end if;

  if p_outcome not in ('PUBLISHED','RETRYABLE_FAILURE','AMBIGUOUS','SKIPPED') then
    raise exception 'invalid distribution outcome';
  end if;

  if p_response_code is not null
     and (p_response_code < 100 or p_response_code > 599) then
    raise exception 'invalid response code';
  end if;

  select *
    into v_receipt
  from public.early_warning_distribution_receipts
  where id = p_receipt_id
  for update;

  if not found then
    raise exception 'distribution receipt not found';
  end if;

  if v_receipt.status = 'PUBLISHED' then
    return query
      select
        v_receipt.id,
        v_receipt.status,
        v_receipt.published_at,
        v_receipt.ambiguous_outcome,
        v_receipt.attempt_count;
    return;
  end if;

  if v_receipt.lease_token is distinct from p_claim_token then
    raise exception 'stale or invalid distribution claim token';
  end if;

  update public.early_warning_distribution_receipts
  set
    status = case p_outcome
      when 'PUBLISHED' then 'PUBLISHED'
      when 'SKIPPED' then 'SKIPPED'
      else 'FAILED'
    end,
    published_at = case
      when p_outcome = 'PUBLISHED' then v_now
      else null
    end,
    external_reference = case
      when p_external_reference is null then external_reference
      else left(p_external_reference, 500)
    end,
    last_error = case
      when p_outcome = 'PUBLISHED' then null
      when p_error is null then p_outcome
      else left(p_error, 1000)
    end,
    ambiguous_outcome = p_outcome = 'AMBIGUOUS',
    last_response_code = p_response_code,
    lease_token = null,
    lease_expires_at = null,
    updated_at = v_now
  where id = v_receipt.id
    and lease_token = p_claim_token
  returning * into v_receipt;

  if not found then
    raise exception 'distribution claim was superseded';
  end if;

  return query
    select
      v_receipt.id,
      v_receipt.status,
      v_receipt.published_at,
      v_receipt.ambiguous_outcome,
      v_receipt.attempt_count;
end;
$$;

revoke all on function public.claim_early_warning_distribution(text, text, text, integer)
  from PUBLIC, anon, authenticated;
revoke all on function public.finalize_early_warning_distribution(uuid, uuid, text, text, text, integer)
  from PUBLIC, anon, authenticated;

grant execute on function public.claim_early_warning_distribution(text, text, text, integer)
  to service_role;
grant execute on function public.finalize_early_warning_distribution(uuid, uuid, text, text, text, integer)
  to service_role;

comment on function public.claim_early_warning_distribution(text, text, text, integer) is
  'Atomically claims one public Early Warning delivery per alert/channel. Published, actively leased, ambiguous, skipped, or payload-drifted receipts are not re-acquired.';
comment on function public.finalize_early_warning_distribution(uuid, uuid, text, text, text, integer) is
  'Finalizes a claimed Early Warning delivery. AMBIGUOUS outcomes fail closed and are not automatically retried.';
