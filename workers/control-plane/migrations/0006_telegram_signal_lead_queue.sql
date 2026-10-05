-- #1414 Section 5: lossless Telegram B2 -> D1 -> canonical ingestion handoff.
--
-- The per-channel checkpoint remains a compact high-water mark, but it is not
-- sufficient as a delivery queue because multiple verified B2 objects may be
-- produced between consumer polls. This table stores only bounded B2 pointers
-- and hashes; raw Telegram content remains in B2 and never in D1.

create table if not exists telegram_signal_lead_queue (
  signal_id text primary key,
  source_channel_key text not null,
  source_record_id integer not null,
  published_at text not null,
  b2_object_key text not null,
  b2_sha256 text not null,
  state text not null default 'PENDING'
    check (state in ('PENDING','CONSUMED')),
  created_at text not null,
  consumed_at text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempt_at text,
  last_error_code text,
  check (source_record_id > 0),
  check (length(source_channel_key) between 5 and 32),
  check (b2_object_key like 'telegram/leads/%'),
  check (length(b2_sha256) = 64)
);

create index if not exists idx_telegram_signal_lead_queue_pending
  on telegram_signal_lead_queue(state, created_at, signal_id);

create index if not exists idx_telegram_signal_lead_queue_channel_record
  on telegram_signal_lead_queue(source_channel_key, source_record_id);
