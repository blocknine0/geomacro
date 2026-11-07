-- #3634: D1 exact committed-day read hotspot (previously ~7k rows per
-- 10-minute recovery check). One-time seed + atomic maintenance on committed
-- timestamp transitions. Does not infer B2 truth, rights or queue ACKs.
-- Existing raw outbox and normalized pointers remain authoritative.
CREATE TABLE IF NOT EXISTS p0b_committed_day_totals (
 day_utc TEXT PRIMARY KEY NOT NULL
  CHECK(length(day_utc)=10 AND day_utc GLOB '[12][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
 committed_count INTEGER NOT NULL DEFAULT 0 CHECK(committed_count>=0)
) WITHOUT ROWID;

-- Safe to re-run on a stopped writer: no fabricated counts. The migration is
-- transactional on D1; if it cannot scan canonical originals, it fails rather
-- than installing an incorrect counter.
INSERT INTO p0b_committed_day_totals(day_utc,committed_count)
 SELECT substr(d1_committed_at,1,10),COUNT(*)
 FROM ingestion_spool_queue WHERE d1_committed_at IS NOT NULL
 GROUP BY substr(d1_committed_at,1,10)
 ON CONFLICT(day_utc) DO UPDATE SET committed_count=excluded.committed_count;

CREATE TRIGGER IF NOT EXISTS trg_p0b_day_committed_insert
 AFTER INSERT ON ingestion_spool_queue
 WHEN NEW.d1_committed_at IS NOT NULL
BEGIN
 INSERT INTO p0b_committed_day_totals(day_utc,committed_count)
 VALUES(substr(NEW.d1_committed_at,1,10),1)
 ON CONFLICT(day_utc) DO UPDATE SET committed_count=committed_count+1;
END;

CREATE TRIGGER IF NOT EXISTS trg_p0b_day_committed_delete
 AFTER DELETE ON ingestion_spool_queue
 WHEN OLD.d1_committed_at IS NOT NULL
BEGIN
 UPDATE p0b_committed_day_totals SET committed_count=committed_count-1
 WHERE day_utc=substr(OLD.d1_committed_at,1,10);
END;

CREATE TRIGGER IF NOT EXISTS trg_p0b_day_committed_clock_change
 AFTER UPDATE OF d1_committed_at ON ingestion_spool_queue
 WHEN OLD.d1_committed_at IS NOT NEW.d1_committed_at
BEGIN
 UPDATE p0b_committed_day_totals SET committed_count=committed_count-1
 WHERE OLD.d1_committed_at IS NOT NULL
 AND day_utc=substr(OLD.d1_committed_at,1,10);
 INSERT INTO p0b_committed_day_totals(day_utc,committed_count)
 SELECT substr(NEW.d1_committed_at,1,10),1
 WHERE NEW.d1_committed_at IS NOT NULL
 ON CONFLICT(day_utc) DO UPDATE SET committed_count=committed_count+1;
END;
