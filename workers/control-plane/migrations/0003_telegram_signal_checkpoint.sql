-- #1414 Section 5: compact Telegram lead-signal checkpoint state.
-- Main Geomacro owns the D1 schema. The private Telegram worker only consumes it.

create table if not exists telegram_signal_checkpoints (
  source_channel_key text primary key,
  last_message_id integer not null default 0,
  last_published_at text,
  last_b2_object_key text,
  last_b2_sha256 text,
  last_signal_id text,
  updated_at text not null
);

create index if not exists idx_telegram_signal_checkpoints_updated_at
  on telegram_signal_checkpoints(updated_at);

create table if not exists telegram_signal_runtime_status (
  id integer primary key check (id = 1),
  schema_version text not null,
  producer_repo text not null,
  producer_commit text not null,
  last_verified_b2_write_at text,
  last_checkpoint_at text,
  last_error_code text,
  updated_at text not null
);

insert into telegram_signal_runtime_status (
  id,
  schema_version,
  producer_repo,
  producer_commit,
  updated_at
) values (
  1,
  'geomacro.telegram-lead-envelope.v1',
  'blocknine0/geomacro-telegram-signals',
  'f3ef91a8387e37843d1b9990bc011fd09035e43f',
  datetime('now')
)
on conflict(id) do update set
  schema_version = excluded.schema_version,
  producer_repo = excluded.producer_repo,
  producer_commit = excluded.producer_commit,
  updated_at = excluded.updated_at;
