-- P0: country-first, exact headline-attributed official-original lookup for Unified Risk Gate.
-- Source raw_json / original identity / B2 archive remain immutable.
-- NULL marks historical rows awaiting bounded cron backfill; ZZZ is
-- a documented non-country sentinel for genuinely unattributed titles.
ALTER TABLE phase2h_private_raw_news
 ADD COLUMN risk_country_iso3 TEXT DEFAULT NULL
 CHECK(risk_country_iso3 IS NULL OR
   (length(risk_country_iso3)=3 AND risk_country_iso3=upper(risk_country_iso3)));

CREATE INDEX IF NOT EXISTS idx_phase2h_risk_country_category_clock
 ON phase2h_private_raw_news(risk_country_iso3,category,original_published_at DESC,record_id DESC);

-- Partial index avoids a full 72-hour raw-original scan during catch-up.
CREATE INDEX IF NOT EXISTS idx_phase2h_risk_country_unindexed_recent
 ON phase2h_private_raw_news(first_ingested_at,record_id)
 WHERE risk_country_iso3 IS NULL;
