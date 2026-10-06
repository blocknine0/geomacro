-- Repin the accepted private Telegram producer after governed discovery
-- expansion. The worker/envelope/B2/D1 contract is unchanged; only bounded
-- official-source discovery/evidence coverage advanced from the previous pin.

update telegram_signal_runtime_status
set
  producer_commit = '68643f25c7ad1ab6bb0fa5238866fb7358eb1ab9',
  schema_version = 'geomacro.telegram-lead-envelope.v1',
  updated_at = datetime('now')
where id = 1;
