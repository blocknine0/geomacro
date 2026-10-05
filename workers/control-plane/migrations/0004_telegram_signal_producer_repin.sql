-- Advance the accepted private Telegram producer SHA after the governed runtime,
-- source-seed, and deployment-workflow merges. Keep the payload schema fixed.

update telegram_signal_runtime_status
set
  producer_commit = '42e6dce0a022f479528f86f665d743a6a64b4dcf',
  schema_version = 'geomacro.telegram-lead-envelope.v1',
  updated_at = datetime('now')
where id = 1;
