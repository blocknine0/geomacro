-- Telegram verified-B2 -> private D1 UNVERIFIED lead handoff.
-- D1 stores source-bound SHA pointers ONLY: no message, headline, URL,
-- raw post or commercially payable event can be promoted by this table.
-- Backward-compatible with protocol v2 and the append-only queue.
create table if not exists telegram_private_unverified_leads (
  delivery_id text primary key,
  signal_id text not null,
  source_id text not null
    check (source_id = 'telegram_authorized_publisher_feed'),
  source_channel_key text not null,
  source_record_id integer not null,
  published_at text not null,
  b2_object_key text not null unique,
  b2_sha256 text not null,
  sanitized_payload_sha256 text not null,
  verification_status text not null default 'UNVERIFIED'
    check (verification_status = 'UNVERIFIED'),
  scoring_eligible integer not null default 0
    check (scoring_eligible = 0),
  commercial_eligible integer not null default 0
    check (commercial_eligible = 0),
  intake_at text not null,
  check (length(delivery_id) = 52),
  check (length(signal_id) = 35),
  check (length(b2_sha256) = 64),
  check (length(sanitized_payload_sha256) = 64),
  check (length(source_channel_key) between 5 and 32),
  check (source_record_id > 0),
  foreign key (delivery_id) references telegram_signal_lead_queue(delivery_id)
);
create index if not exists idx_telegram_private_unverified_channel
  on telegram_private_unverified_leads(source_channel_key,source_record_id);
