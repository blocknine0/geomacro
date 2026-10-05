-- #1414 Section 5: lossless Telegram B2 -> D1 -> canonical ingestion handoff.
--
-- telegram_signal_checkpoints stays the compact per-channel high-water mark.
-- Delivery is append-only: D1 automatically snapshots every verified checkpoint
-- version into telegram_signal_lead_queue inside the same SQLite transaction.
-- A queue insert failure therefore prevents checkpoint advancement. Version
-- identity uses the verified compressed B2 SHA so Telegram edits that reuse the
-- same message/signal id remain distinct deliveries. D1 stores pointers only.

create table if not exists telegram_signal_lead_queue (
  delivery_id text primary key,
  signal_id text not null,
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
  check (length(delivery_id) = 52),
  check (length(signal_id) = 35),
  check (source_record_id > 0),
  check (length(source_channel_key) between 5 and 32),
  check (b2_object_key like 'telegram/leads/%'),
  check (length(b2_sha256) = 64)
);

create index if not exists idx_telegram_signal_lead_queue_pending
  on telegram_signal_lead_queue(state, created_at, delivery_id);

create index if not exists idx_telegram_signal_lead_queue_signal
  on telegram_signal_lead_queue(signal_id, created_at);

create index if not exists idx_telegram_signal_lead_queue_channel_record
  on telegram_signal_lead_queue(source_channel_key, source_record_id, created_at);

-- Preserve any already-verified high-water marks that existed before this
-- migration. INSERT OR IGNORE keeps re-application idempotent.
insert or ignore into telegram_signal_lead_queue (
  delivery_id, signal_id, source_channel_key, source_record_id, published_at,
  b2_object_key, b2_sha256, state, created_at
)
select
  last_signal_id || '_' || substr(last_b2_sha256, 1, 16),
  last_signal_id,
  source_channel_key,
  last_message_id,
  last_published_at,
  last_b2_object_key,
  lower(last_b2_sha256),
  'PENDING',
  updated_at
from telegram_signal_checkpoints
where last_signal_id is not null
  and last_b2_object_key is not null
  and last_b2_sha256 is not null
  and last_published_at is not null
  and length(last_signal_id) = 35
  and length(last_b2_sha256) = 64;

drop trigger if exists trg_telegram_checkpoint_enqueue_insert;
create trigger trg_telegram_checkpoint_enqueue_insert
after insert on telegram_signal_checkpoints
when new.last_signal_id is not null
 and new.last_b2_object_key is not null
 and new.last_b2_sha256 is not null
 and new.last_published_at is not null
begin
  insert or ignore into telegram_signal_lead_queue (
    delivery_id, signal_id, source_channel_key, source_record_id, published_at,
    b2_object_key, b2_sha256, state, created_at
  ) values (
    new.last_signal_id || '_' || substr(lower(new.last_b2_sha256), 1, 16),
    new.last_signal_id,
    new.source_channel_key,
    new.last_message_id,
    new.last_published_at,
    new.last_b2_object_key,
    lower(new.last_b2_sha256),
    'PENDING',
    new.updated_at
  );
end;

drop trigger if exists trg_telegram_checkpoint_enqueue_update;
create trigger trg_telegram_checkpoint_enqueue_update
after update of last_b2_object_key, last_b2_sha256, last_signal_id on telegram_signal_checkpoints
when new.last_signal_id is not null
 and new.last_b2_object_key is not null
 and new.last_b2_sha256 is not null
 and new.last_published_at is not null
 and (
   old.last_b2_object_key is not new.last_b2_object_key
   or old.last_b2_sha256 is not new.last_b2_sha256
   or old.last_signal_id is not new.last_signal_id
 )
begin
  insert or ignore into telegram_signal_lead_queue (
    delivery_id, signal_id, source_channel_key, source_record_id, published_at,
    b2_object_key, b2_sha256, state, created_at
  ) values (
    new.last_signal_id || '_' || substr(lower(new.last_b2_sha256), 1, 16),
    new.last_signal_id,
    new.source_channel_key,
    new.last_message_id,
    new.last_published_at,
    new.last_b2_object_key,
    lower(new.last_b2_sha256),
    'PENDING',
    new.updated_at
  );
end;
