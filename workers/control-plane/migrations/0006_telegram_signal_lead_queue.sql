-- #1414 Section 5: lossless Telegram B2 -> D1 -> canonical ingestion handoff.
--
-- The per-channel checkpoint remains a compact high-water mark, but it is not
-- a delivery queue. Multiple verified B2 objects may be produced between polls,
-- and Telegram edits reuse the same message/signal identity. delivery_id is
-- therefore versioned by content_hash so every verified content version is
-- independently retryable. D1 stores pointers/hashes only; raw content remains
-- in B2.

create table if not exists telegram_signal_lead_queue (
  delivery_id text primary key,
  signal_id text not null,
  content_hash text not null,
  source_channel_key text not null,
  source_record_id integer not null,
  published_at text not null,
  b2_object_key text not null unique,
  b2_sha256 text not null,
  state text not null default 'PENDING'
    check (state in ('PENDING','CONSUMED')),
  created_at text not null,
  consumed_at text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempt_at text,
  last_error_code text,
  check (delivery_id glob 'tg_[0-9a-f]*_[0-9a-f]*'),
  check (length(delivery_id) = 52),
  check (signal_id glob 'tg_[0-9a-f]*'),
  check (length(signal_id) = 35),
  check (content_hash glob '[0-9a-f]*'),
  check (length(content_hash) = 64),
  check (source_record_id > 0),
  check (length(source_channel_key) between 5 and 32),
  check (b2_object_key like 'telegram/leads/%'),
  check (length(b2_sha256) = 64)
);

create index if not exists idx_telegram_signal_lead_queue_pending
  on telegram_signal_lead_queue(state, created_at, delivery_id);

create index if not exists idx_telegram_signal_lead_queue_signal_version
  on telegram_signal_lead_queue(signal_id, content_hash);

create index if not exists idx_telegram_signal_lead_queue_channel_record
  on telegram_signal_lead_queue(source_channel_key, source_record_id, created_at);
