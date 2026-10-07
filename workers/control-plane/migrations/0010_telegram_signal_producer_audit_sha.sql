-- Audit-only repin for the private Telegram producer.
-- Consumer acceptance remains producer repository + envelope schema + immutable
-- protocol_contract_sha256. This commit SHA is not an acceptance/security pin.

update telegram_signal_runtime_status
set
  producer_commit = '408ad3ffd689e6422fce6dac51dfdbbb78f642a6',
  updated_at = datetime('now')
where id = 1
  and producer_repo = 'blocknine0/geomacro-telegram-signals'
  and schema_version = 'geomacro.telegram-lead-envelope.v2'
  and protocol_contract_sha256 = '6da33ed2a966d58122039ba38d83e801476a6318bc89634d0b3d951e8ad017c9';
