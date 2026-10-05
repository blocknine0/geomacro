-- #1414 Section 5: lossless compact Telegram lead handoff queue.
--
-- Main Geomacro owns this schema. The private Telegram producer continues to
-- write only its compact latest-per-channel checkpoint after B2 upload +
-- readback/hash verification. D1 triggers convert every checkpoint advancement
-- into an immutable handoff row, so fast channels cannot overwrite intermediate
-- leads before main consumes them. No raw Telegram message/body is stored here.

create table if not exists telegram_signal_handoff_queue (
  handoff_id text primary key,
  signal_id text not null,
  source_channel_key text not null,
  source_record_id text not null,
  published_at text not null,
  b2_object_key text not null,
  b2_sha256 text not null,
  producer_commit text not null,
  status text not null default 'PENDING' check (status in ('PENDING','CONSUMED','REJECTED')),
  attempts integer not null default 0,
  last_error_code text,
  created_at text not null,
  consumed_at text
);

create unique index if not exists idx_telegram_signal_handoff_object
  on telegram_signal_handoff_queue(b2_object_key, b2_sha256);

create index if not exists idx_telegram_signal_handoff_pending
  on telegram_signal_handoff_queue(status, created_at);

create table if not exists telegram_signal_consumer_state (
  id integer primary key check (id = 1),
  last_consumed_handoff_id text,
  last_consumed_at text,
  last_error_code text,
  updated_at text not null
);

insert into telegram_signal_consumer_state(id, updated_at)
values (1, datetime('now'))
on conflict(id) do nothing;

-- Enqueue the initial checkpoint only after the producer has persisted a verified
-- B2 pointer/hash. handoff_id includes the B2 hash prefix so a Telegram edit of
-- the same message id becomes a distinct immutable handoff version.
create trigger if not exists trg_telegram_signal_checkpoint_enqueue_insert
after insert on telegram_signal_checkpoints
when new.last_signal_id is not null
 and new.last_b2_object_key is not null
 and new.last_b2_sha256 is not null
begin
  insert or ignore into telegram_signal_handoff_queue (
    handoff_id,
    signal_id,
    source_channel_key,
    source_record_id,
    published_at,
    b2_object_key,
    b2_sha256,
    producer_commit,
    status,
    created_at
  ) values (
    new.last_signal_id || ':' || substr(new.last_b2_sha256, 1, 16),
    new.last_signal_id,
    new.source_channel_key,
    cast(new.last_message_id as text),
    coalesce(new.last_published_at, new.updated_at),
    new.last_b2_object_key,
    new.last_b2_sha256,
    coalesce((select producer_commit from telegram_signal_runtime_status where id = 1), 'UNKNOWN'),
    'PENDING',
    datetime('now')
  );
end;

-- Every verified B2 pointer/hash change becomes a new handoff row. This keeps
-- edited Telegram messages and rapid sequential posts lossless even though the
-- producer checkpoint itself remains latest-per-channel.
create trigger if not exists trg_telegram_signal_checkpoint_enqueue_update
after update of last_message_id,last_published_at,last_b2_object_key,last_b2_sha256,last_signal_id
on telegram_signal_checkpoints
when new.last_signal_id is not null
 and new.last_b2_object_key is not null
 and new.last_b2_sha256 is not null
 and (
   new.last_b2_sha256 is not old.last_b2_sha256
   or new.last_b2_object_key is not old.last_b2_object_key
 )
begin
  insert or ignore into telegram_signal_handoff_queue (
    handoff_id,
    signal_id,
    source_channel_key,
    source_record_id,
    published_at,
    b2_object_key,
    b2_sha256,
    producer_commit,
    status,
    created_at
  ) values (
    new.last_signal_id || ':' || substr(new.last_b2_sha256, 1, 16),
    new.last_signal_id,
    new.source_channel_key,
    cast(new.last_message_id as text),
    coalesce(new.last_published_at, new.updated_at),
    new.last_b2_object_key,
    new.last_b2_sha256,
    coalesce((select producer_commit from telegram_signal_runtime_status where id = 1), 'UNKNOWN'),
    'PENDING',
    datetime('now')
  );
end;
