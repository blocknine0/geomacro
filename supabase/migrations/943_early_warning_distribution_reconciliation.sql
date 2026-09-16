-- =============================================================================
-- Early Warning Distribution Manual Reconciliation
--
-- Ambiguous delivery outcomes must never be retried automatically. This adds an
-- append-only audit trail and a service-role-only reconciliation RPC so an
-- operator can explicitly resolve an ambiguous receipt after checking the
-- remote platform.
--
-- This migration does not enable live publishing.
-- =============================================================================

create table if not exists public.early_warning_distribution_reconciliations (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.early_warning_distribution_receipts(id) on delete restrict,
  resolution text not null,
  actor text not null,
  note text not null,
  observed_external_reference text,
  observed_published_at timestamptz,
  resolved_at timestamptz not null default now(),

  constraint early_warning_distribution_reconciliation_resolution_check
    check (resolution in ('PUBLISHED','RETRYABLE_FAILURE','SKIPPED')),
  constraint early_warning_distribution_reconciliation_actor_check
    check (char_length(trim(actor)) between 1 and 120),
  constraint early_warning_distribution_reconciliation_note_check
    check (char_length(trim(note)) between 8 and 1000),
  constraint early_warning_distribution_reconciliation_reference_check
    check (observed_external_reference is null or char_length(observed_external_reference) <= 500),
  constraint early_warning_distribution_reconciliation_published_time_check
    check (
      (resolution = 'PUBLISHED') or
      observed_published_at is null
    )
);

create index if not exists early_warning_distribution_reconciliation_receipt_idx
  on public.early_warning_distribution_reconciliations (receipt_id, resolved_at desc);

alter table public.early_warning_distribution_reconciliations enable row level security;
revoke all on table public.early_warning_distribution_reconciliations from PUBLIC, anon, authenticated;
grant all on table public.early_warning_distribution_reconciliations to service_role;

create or replace function public.reconcile_early_warning_distribution(
  p_receipt_id uuid,
  p_resolution text,
  p_actor text,
  p_note text,
  p_external_reference text default null,
  p_observed_published_at timestamptz default null
)
returns table (
  receipt_id uuid,
  receipt_status text,
  ambiguous_outcome boolean,
  published_at timestamptz,
  attempt_count integer,
  reconciliation_id uuid
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_receipt public.early_warning_distribution_receipts%rowtype;
  v_resolution text := upper(trim(coalesce(p_resolution, '')));
  v_actor text := trim(coalesce(p_actor, ''));
  v_note text := trim(coalesce(p_note, ''));
  v_reference text := nullif(trim(coalesce(p_external_reference, '')), '');
  v_now timestamptz := clock_timestamp();
  v_reconciliation_id uuid;
begin
  if p_receipt_id is null then
    raise exception 'receipt id is required';
  end if;

  if v_resolution not in ('PUBLISHED','RETRYABLE_FAILURE','SKIPPED') then
    raise exception 'invalid reconciliation resolution';
  end if;

  if char_length(v_actor) < 1 or char_length(v_actor) > 120 then
    raise exception 'reconciliation actor must be between 1 and 120 characters';
  end if;

  if char_length(v_note) < 8 or char_length(v_note) > 1000 then
    raise exception 'reconciliation note must be between 8 and 1000 characters';
  end if;

  if v_reference is not null and char_length(v_reference) > 500 then
    raise exception 'external reference is too long';
  end if;

  if v_resolution <> 'PUBLISHED' and p_observed_published_at is not null then
    raise exception 'observed published time is only valid for PUBLISHED reconciliation';
  end if;

  if p_observed_published_at is not null and p_observed_published_at > v_now + interval '5 minutes' then
    raise exception 'observed published time cannot be in the future';
  end if;

  select * into v_receipt
  from public.early_warning_distribution_receipts
  where id = p_receipt_id
  for update;

  if not found then
    raise exception 'distribution receipt not found';
  end if;

  if v_receipt.lease_token is not null then
    raise exception 'cannot reconcile a receipt with an active or unresolved lease';
  end if;

  if v_receipt.ambiguous_outcome is not true then
    raise exception 'distribution receipt is not awaiting ambiguous-outcome reconciliation';
  end if;

  insert into public.early_warning_distribution_reconciliations (
    receipt_id,
    resolution,
    actor,
    note,
    observed_external_reference,
    observed_published_at,
    resolved_at
  ) values (
    v_receipt.id,
    v_resolution,
    v_actor,
    v_note,
    v_reference,
    p_observed_published_at,
    v_now
  )
  returning id into v_reconciliation_id;

  update public.early_warning_distribution_receipts
  set status = case v_resolution
        when 'PUBLISHED' then 'PUBLISHED'
        when 'SKIPPED' then 'SKIPPED'
        else 'FAILED'
      end,
      ambiguous_outcome = false,
      published_at = case
        when v_resolution = 'PUBLISHED' then coalesce(p_observed_published_at, v_now)
        else null
      end,
      external_reference = case
        when v_reference is not null then v_reference
        else external_reference
      end,
      last_error = case
        when v_resolution = 'PUBLISHED' then null
        when v_resolution = 'RETRYABLE_FAILURE' then 'manual reconciliation confirmed retryable failure'
        else 'manual reconciliation marked delivery skipped'
      end,
      updated_at = v_now
  where id = v_receipt.id
  returning * into v_receipt;

  return query select
    v_receipt.id,
    v_receipt.status,
    v_receipt.ambiguous_outcome,
    v_receipt.published_at,
    v_receipt.attempt_count,
    v_reconciliation_id;
end;
$$;

revoke all on function public.reconcile_early_warning_distribution(uuid, text, text, text, text, timestamptz)
  from PUBLIC, anon, authenticated;

grant execute on function public.reconcile_early_warning_distribution(uuid, text, text, text, text, timestamptz)
  to service_role;

comment on table public.early_warning_distribution_reconciliations is
  'Append-only audit records for explicit manual resolution of ambiguous Early Warning delivery receipts.';
comment on function public.reconcile_early_warning_distribution(uuid, text, text, text, text, timestamptz) is
  'Manually resolves an ambiguous delivery receipt as PUBLISHED, RETRYABLE_FAILURE, or SKIPPED and appends an audit record. Service-role only.';
