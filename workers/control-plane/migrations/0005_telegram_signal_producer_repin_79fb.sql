-- Advance the accepted private Telegram producer after the long-term D1/runtime,
-- authorization, deployment, discovery-resilience and CI hardening landed in
-- blocknine0/geomacro-telegram-signals. Keep the payload schema unchanged.

update telegram_signal_runtime_status
set
  producer_commit = '79fb75cf342a652216cff4355448012c5bab8cbf',
  schema_version = 'geomacro.telegram-lead-envelope.v1',
  updated_at = datetime('now')
where id = 1;
