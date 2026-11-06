-- Exact-key imports are already included in the verified physical account
-- baseline. Keep their D1 rows searchable without counting their bytes twice.
ALTER TABLE files ADD COLUMN baseline_accounted INTEGER NOT NULL DEFAULT 0
  CHECK (baseline_accounted IN (0,1));

DROP TRIGGER IF EXISTS files_reserve_storage_and_upload_quota;
CREATE TRIGGER files_reserve_storage_and_upload_quota
BEFORE INSERT ON files
WHEN NEW.status = 'pending'
BEGIN
  SELECT CASE WHEN (SELECT verified_at FROM b2_storage_baseline WHERE singleton=1) IS NULL
    THEN RAISE(ABORT, 'B2_STORAGE_BASELINE_UNVERIFIED') END;
  SELECT CASE WHEN
    (SELECT account_bytes FROM b2_storage_baseline WHERE singleton=1) +
    (SELECT COALESCE(SUM(size_bytes),0) FROM files WHERE baseline_accounted=0) + NEW.size_bytes > 9200000000
    THEN RAISE(ABORT, 'B2_STORAGE_HARD_LIMIT') END;
  INSERT INTO b2_daily_usage(day_utc,upload_requests,class_a_calls,updated_at)
  VALUES (substr(NEW.created_at,1,10),1,1,NEW.created_at)
  ON CONFLICT(day_utc) DO UPDATE SET
    upload_requests=upload_requests+1,
    class_a_calls=class_a_calls+1,
    updated_at=excluded.updated_at
  WHERE upload_requests < 2000 AND class_a_calls < 2000 AND blocked_reason IS NULL;
  SELECT CASE WHEN changes() = 0
    THEN RAISE(ABORT, 'B2_DAILY_UPLOAD_OR_CLASS_A_LIMIT') END;
END;
