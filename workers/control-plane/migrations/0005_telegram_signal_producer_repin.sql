-- #1414 Section 5: advance the accepted private Telegram producer pin only
-- after both Telegram Signals CI and Telegram Worker CI passed on the exact SHA.
update telegram_signal_runtime_status
set
  producer_commit = '79fb75cf342a652216cff4355448012c5bab8cbf',
  schema_version = 'geomacro.telegram-lead-envelope.v1',
  updated_at = datetime('now')
where id = 1;
