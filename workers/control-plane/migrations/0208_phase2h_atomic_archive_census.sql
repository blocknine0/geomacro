-- #3634: low-read exact Phase2H raw-archive category census.
-- Canonical counters live in the SAME D1 transaction as INSERT/ACK/DELETE.
-- This is not independent physical B2 proof; never interpret as certified GRO.
-- First-time seed is a single known full read, not a recurring whole-table scan.
CREATE TABLE IF NOT EXISTS phase2h_archive_totals (
 category TEXT PRIMARY KEY NOT NULL CHECK(category IN ('geopolitics','macro','rare_earth')),
 staged_count INTEGER NOT NULL DEFAULT 0 CHECK(staged_count>=0),
 archived_count INTEGER NOT NULL DEFAULT 0
   CHECK(archived_count>=0 AND archived_count<=staged_count)
);
INSERT OR IGNORE INTO phase2h_archive_totals(category) VALUES
 ('geopolitics'),('macro'),('rare_earth');
UPDATE phase2h_archive_totals
 SET staged_count=(SELECT COUNT(*) FROM phase2h_private_raw_news r
   WHERE r.category=phase2h_archive_totals.category),
     archived_count=(SELECT COUNT(*) FROM phase2h_private_raw_news r
   WHERE r.category=phase2h_archive_totals.category AND r.b2_object_sha256 IS NOT NULL);
-- The age-specific pending page is read only from the recent eligible set.
-- The partial index is not updated on a repeated unchanged/duplicate poll.
CREATE INDEX IF NOT EXISTS idx_phase2h_pending_recent_ingested_category
 ON phase2h_private_raw_news(first_ingested_at,category)
 WHERE b2_object_sha256 IS NULL;

CREATE TRIGGER IF NOT EXISTS trg_phase2h_census_insert
 AFTER INSERT ON phase2h_private_raw_news BEGIN
  UPDATE phase2h_archive_totals SET
   staged_count=staged_count+1,
   archived_count=archived_count+(NEW.b2_object_sha256 IS NOT NULL)
  WHERE category=NEW.category;
END;
CREATE TRIGGER IF NOT EXISTS trg_phase2h_census_delete
 AFTER DELETE ON phase2h_private_raw_news BEGIN
  UPDATE phase2h_archive_totals SET
   archived_count=archived_count-(OLD.b2_object_sha256 IS NOT NULL),
   staged_count=staged_count-1
  WHERE category=OLD.category;
END;
CREATE TRIGGER IF NOT EXISTS trg_phase2h_census_ack
 AFTER UPDATE OF b2_object_sha256 ON phase2h_private_raw_news
 WHEN OLD.b2_object_sha256 IS NOT NEW.b2_object_sha256 BEGIN
  UPDATE phase2h_archive_totals SET archived_count=archived_count+
   (NEW.b2_object_sha256 IS NOT NULL)-(OLD.b2_object_sha256 IS NOT NULL)
  WHERE category=NEW.category;
END;
-- Category is immutable in the original record. If a privileged legacy
-- script accidentally changes it, don't leave a counter mismatch.
CREATE TRIGGER IF NOT EXISTS trg_phase2h_census_no_category_rewrite
 BEFORE UPDATE OF category ON phase2h_private_raw_news
 WHEN OLD.category IS NOT NEW.category BEGIN
  SELECT RAISE(ABORT,'PHASE2H_IMMUTABLE_CATEGORY');
END;
