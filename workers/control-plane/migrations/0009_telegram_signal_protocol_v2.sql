-- #1414 Section 5 long-term Telegram bridge acceptance.
-- Exact producer commits remain audit metadata. Consumer acceptance is pinned
-- to producer repository + envelope schema + immutable protocol contract hash.

alter table telegram_signal_runtime_status
  add column protocol_contract_sha256 text;

update telegram_signal_runtime_status
set
  schema_version = 'geomacro.telegram-lead-envelope.v2',
  producer_repo = 'blocknine0/geomacro-telegram-signals',
  producer_commit = 'd7d18d9dc122f64980870bd08676b135d161ff41',
  protocol_contract_sha256 = '6da33ed2a966d58122039ba38d83e801476a6318bc89634d0b3d951e8ad017c9',
  updated_at = datetime('now')
where id = 1;
