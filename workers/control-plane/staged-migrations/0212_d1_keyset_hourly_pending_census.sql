-- Additive D1 read-cost optimization. Apply ONLY after protected 0204-0211
-- migrations, backed-up source census, and provider quota headroom checks.
-- Existing 0208 lifetime counters remain authoritative and unchanged.
--
-- A 72h moving window cannot be represented by a single lifetime counter:
-- maintain exact UTC-hour pending bins, then scan ONLY the partial boundary
-- hour to compute the mathematically exact rolling cutoff.
CREATE TABLE IF NOT EXISTS phase2h_pending_hourly_v1 (
 category TEXT NOT NULL CHECK(category IN ('geopolitics','macro','rare_earth')),
 hour_utc TEXT NOT NULL CHECK(length(hour_utc)=13),
 pending_count INTEGER NOT NULL DEFAULT 0 CHECK(pending_count>=0),
 PRIMARY KEY(category,hour_utc)
);
-- One-time quota-gated seed; NEVER repeat as a poll or scheduled census.
INSERT INTO phase2h_pending_hourly_v1(category,hour_utc,pending_count)
 SELECT category,substr(first_ingested_at,1,13),COUNT(*)
 FROM phase2h_private_raw_news WHERE b2_object_sha256 IS NULL
 GROUP BY category,substr(first_ingested_at,1,13)
 ON CONFLICT(category,hour_utc) DO NOTHING;
CREATE TRIGGER IF NOT EXISTS trg_phase2h_hourly_pending_insert_v1
 AFTER INSERT ON phase2h_private_raw_news
 WHEN NEW.b2_object_sha256 IS NULL BEGIN
 INSERT INTO phase2h_pending_hourly_v1(category,hour_utc,pending_count)
 VALUES(NEW.category,substr(NEW.first_ingested_at,1,13),1)
 ON CONFLICT(category,hour_utc) DO UPDATE SET
  pending_count=pending_count+1;
END;
CREATE TRIGGER IF NOT EXISTS trg_phase2h_hourly_pending_delete_v1
 AFTER DELETE ON phase2h_private_raw_news
 WHEN OLD.b2_object_sha256 IS NULL BEGIN
 UPDATE phase2h_pending_hourly_v1 SET pending_count=pending_count-1
 WHERE category=OLD.category AND hour_utc=substr(OLD.first_ingested_at,1,13);
END;
CREATE TRIGGER IF NOT EXISTS trg_phase2h_hourly_pending_ack_v1
 AFTER UPDATE OF b2_object_sha256 ON phase2h_private_raw_news
 WHEN OLD.b2_object_sha256 IS NULL AND NEW.b2_object_sha256 IS NOT NULL BEGIN
 UPDATE phase2h_pending_hourly_v1 SET pending_count=pending_count-1
 WHERE category=NEW.category AND hour_utc=substr(NEW.first_ingested_at,1,13);
END;
CREATE TRIGGER IF NOT EXISTS trg_phase2h_hourly_pending_reversal_v1
 AFTER UPDATE OF b2_object_sha256 ON phase2h_private_raw_news
 WHEN OLD.b2_object_sha256 IS NOT NULL AND NEW.b2_object_sha256 IS NULL BEGIN
 INSERT INTO phase2h_pending_hourly_v1(category,hour_utc,pending_count)
 VALUES(NEW.category,substr(NEW.first_ingested_at,1,13),1)
 ON CONFLICT(category,hour_utc) DO UPDATE SET pending_count=pending_count+1;
END;
CREATE TRIGGER IF NOT EXISTS trg_phase2h_hourly_first_seen_immutable_v1
 BEFORE UPDATE OF first_ingested_at ON phase2h_private_raw_news
 WHEN OLD.first_ingested_at IS NOT NEW.first_ingested_at BEGIN
 SELECT RAISE(ABORT,'PHASE2H_IMMUTABLE_FIRST_INGESTION');
END;
-- Existing compound index 0204 is (country,category,native-clock,item).
-- The country-only research reader also needs ordered native-clock keysets.
CREATE INDEX IF NOT EXISTS idx_private_osint_country_clock_v3
 ON private_osint_news_25h(country_iso3,native_feed_published_at DESC,item_id DESC);
-- Cold/canary category reads retain an indexed 72h ordered fallback.
CREATE INDEX IF NOT EXISTS idx_website_derived_category_clock_v3
 ON website_derived_intelligence(category,published_at DESC,id DESC);
