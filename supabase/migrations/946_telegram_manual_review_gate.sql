-- =============================================================================
-- Geomacro Telegram manual-review gate
--
-- Public Telegram channels are internal lead sources only. No channel may be
-- ingested merely because it is present in worker environment variables.
-- Founder/operator manual review and explicit enablement are required first.
-- Telegram evidence always enters as UNVERIFIED and cannot directly authorize
-- GRI, Risk Gate, paid delivery, or public intelligence.
-- =============================================================================

alter table public.live_telegram_channel_registry
  add column if not exists manual_review_status text not null default 'PENDING',
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by text,
  add column if not exists review_reference text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'live_telegram_channel_registry_manual_review_status_check'
  ) then
    alter table public.live_telegram_channel_registry
      add constraint live_telegram_channel_registry_manual_review_status_check
      check (manual_review_status in ('PENDING', 'APPROVED', 'REJECTED'));
  end if;
end
$$;

-- Reset every pre-existing starter entry to a conservative hold. Historical
-- starter rows were created before the explicit manual-review gate existed.
update public.live_telegram_channel_registry
set
  enabled = false,
  manual_review_status = 'PENDING',
  reviewed_at = null,
  reviewed_by = null,
  review_reference = null,
  updated_at = now();

comment on column public.live_telegram_channel_registry.manual_review_status is
  'Founder/operator review gate. Only APPROVED rows may be enabled for Telegram raw-signal ingestion.';

comment on column public.live_telegram_channel_registry.review_reference is
  'Internal reference documenting why the public channel identity and intended internal-use boundary were approved or rejected.';

comment on table public.live_telegram_channel_registry is
  'Server-side public Telegram raw-signal registry. Channels are disabled by default and require manual_review_status=APPROVED plus enabled=true. Telegram-only evidence never directly enters production intelligence.';
