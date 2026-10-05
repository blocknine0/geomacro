-- #1414 Section 5: lossless compact Telegram lead handoff queue.
--
-- Producer writes one compact pointer row only after the corresponding B2 object
-- is uploaded and hash-verified. Main consumes rows idempotently into the
-- canonical evidence pipeline. No raw Telegram body is stored in D1.

create table if not exists telegram_signal_handoff_queue (
  signal_id text primary key,
  source_channel_key text not null,
  source_record_id text not null,
  published_at text not null,
  category text not null check (category in ('GEOPOLITICS','MACRO','CRITICAL_MINERALS')),
  country_iso3 text,
  b2_object_key text not null,
  b2_sha256 text not null,
  producer_commit text not null,
  status text not null default 'PENDING' check (status in ('PENDING','CONSUMED','REJECTED')),
  attempts integer not null default 0,
  last_error_code text,
  created_at text not null,
  consumed_at text
);

create unique index if not exists idx_telegram_signal_handoff_source_record
  on telegram_signal_handoff_queue(source_channel_key, source_record_id);

create index if not exists idx_telegram_signal_handoff_pending
  on telegram_signal_handoff_queue(status, created_at);

-- Consumer acknowledgement is deliberately separate from the producer's latest
-- checkpoint so a fast channel cannot overwrite intermediate unconsumed leads.
create table if not exists telegram_signal_consumer_state (
  id integer primary key check (id = 1),
  last_consumed_signal_id text,
  last_consumed_at text,
  last_error_code text,
  updated_at text not null
);

insert into telegram_signal_consumer_state(id, updated_at)
values (1, datetime('now'))
on conflict(id) do nothing;
