-- 0223: preserve only the existing Hot50 watch-filter event code for
-- internal corroboration. No Telegram text, title, channel or URL is stored.
ALTER TABLE telegram_research_json ADD COLUMN watch_event TEXT
  CHECK (watch_event IS NULL OR watch_event IN (
    'conflict','sanctions','export_ban','chokepoint_disruption',
    'fx_sovereign_stress','critical_mineral_supply_shock'
  ));

CREATE INDEX IF NOT EXISTS idx_telegram_research_hot50_watch
  ON telegram_research_json(country_iso3,category,watch_event,published_at DESC)
  WHERE country_iso3 IS NOT NULL AND watch_event IS NOT NULL;
