-- =============================================================================
-- Early Warning Distribution Fail-Closed Reclaim Hardening
--
-- Tightens the migration-940 claim lease so a worker crash after an external
-- write can never silently become an automatic duplicate post later.
--
-- Rules:
-- - a new/unattempted PENDING receipt may be claimed once;
-- - only an explicitly finalized RETRYABLE_FAILURE may be reclaimed;
-- - an expired/unfinalized PENDING lease is converted to ambiguous + manual-only;
-- - attempt_count >= 5 returns retry_blocked instead of relying on a constraint error;
-- - legacy zero-attempt receipts may bind their first payload hash once.
--
-- This migration does not enable live public distribution.
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

  if p_channel not in ('telegram','discord','bluesky','mastodon','linkedin','x','rss','webhook','email') then
    raise exception 'unsupported distribution channel';
  end if;

  if p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid payload hash';
  end if;

  if p_lease_seconds < 30 or p_lease_seconds > 600 then
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

  if v_receipt.payload_hash is null
     and v_receipt.attempt_count = 0
     and v_receipt.status = 'PENDING' then
    update public.early_warning_distribution_receipts
    set payload_hash = p_payload_hash,
        updated_at = v_now
    where id = v_receipt.id
    returning * into v_receipt;
  elsif v_receipt.payload_hash is distinct from p_payload_hash then
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

  if v_receipt.lease_expires_at is not null and v_receipt.lease_expires_at > v_now then
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

  -- A prior attempt that never reached finalize is unknowable. The remote service
  -- may already have accepted the post, so an expired PENDING lease is terminal
  -- for automation and must be reconciled manually before any later retry.
  if v_receipt.status = 'PENDING' and v_receipt.attempt_count > 0 then
    update public.early_warning_distribution_receipts
    set status = 'FAILED',
        ambiguous_outcome = true,
        last_error = left(
          coalesce(nullif(last_error, '') || '; ', '') ||
          'stale unfinalized delivery claim expired; manual reconciliation required',
          1000
        ),
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

  if v_receipt.attempt_count >= 5 then
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

  -- Only an untouched PENDING receipt or an explicitly finalized non-ambiguous
  -- FAILED receipt can reach this point.
  if v_receipt.status not in ('PENDING','FAILED') then
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
  set status = 'PENDING',
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
  'Atomically claims one public Early Warning delivery per alert/channel. Expired unfinalized claims become ambiguous/manual-only; only explicitly retryable finalized failures may be reclaimed, with a hard five-attempt ceiling.';
