-- Repin the accepted private Telegram producer after three-domain discovery
-- fairness hardening. The worker/envelope/B2/D1 contract is unchanged; only
-- bounded governed discovery scheduling advanced across all three commercial domains.

update telegram_signal_runtime_status
set
  producer_commit = 'aba12aea43ec8a5c9e54a4266e639903d531ad33',
  schema_version = 'geomacro.telegram-lead-envelope.v1',
  updated_at = datetime('now')
where id = 1;
