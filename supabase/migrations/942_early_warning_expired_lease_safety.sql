-- =============================================================================
-- Early Warning Distribution Expired-Lease Safety
--
-- A delivery worker can crash after the remote platform accepted a post but
-- before Geomacro finalizes the receipt. Re-acquiring that expired lease could
-- duplicate a public post on non-idempotent channels. Therefore an expired
-- claim is treated as an ambiguous outcome and requires manual reconciliation.
--
-- This migration does not enable live publishing.
-- =============================================================================

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

  if p_channel is null or p_channel not in ('telegram','discord','bluesky','mastodon','linkedin','x','rss','webhook','email') then
    raise exception 'unsupported distribution channel';
  end if;

  if p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid payload hash';
  end if;

  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 600 then
    raise exception 'lease seconds must be between 30 and 600';
  end if;

  select * into v_alert
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

  select * into v_receipt
  from public.early_warning_distribution_receipts
  where early_warning_alert_id = v_alert.id
    and channel = p_channel
  for update;

  if v_receipt.payload_hash is distinct from p_payload_hash then
    return query select
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
    return query select
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
    return query select
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

  -- An unfinalized expired lease has an unknowable remote outcome. Never retry
  -- it automatically. Mark it ambiguous and require explicit reconciliation.
  if v_receipt.lease_token is not null then
    if v_receipt.lease_expires_at > v_now then
      return query select
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

    update public.early_warning_distribution_receipts
    set status = 'FAILED',
        ambiguous_outcome = true,
        last_error = 'expired delivery lease requires manual reconciliation',
        lease_token = null,
        lease_expires_at = null,
        updated_at = v_now
    where id = v_receipt.id
    returning * into v_receipt;

    return query select
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

  -- Migration 941 provides the database check. This explicit branch makes the
  -- claim contract fail closed instead of surfacing a constraint exception.
  if v_receipt.attempt_count >= 5 then
    update public.early_warning_distribution_receipts
    set status = 'FAILED',
        last_error = coalesce(last_error, 'maximum distribution attempts reached'),
        updated_at = v_now
    where id = v_receipt.id
    returning * into v_receipt;

    return query select
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
  set lease_token = v_token,
      lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
      attempt_count = attempt_count + 1,
      first_attempt_at = coalesce(first_attempt_at, v_now),
      last_attempt_at = v_now,
      last_error = null,
      last_response_code = null,
      updated_at = v_now
  where id = v_receipt.id
  returning * into v_receipt;

  return query select
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

revoke all on function public.claim_early_warning_distribution(text, text, text, integer)
  from PUBLIC, anon, authenticated;

grant execute on function public.claim_early_warning_distribution(text, text, text, integer)
  to service_role;

comment on function public.claim_early_warning_distribution(text, text, text, integer) is
  'Atomically claims one public Early Warning delivery per alert/channel. Expired unfinalized leases become ambiguous and require manual reconciliation; they are never automatically reacquired.';
