-- Exact-key imports are already included in the verified physical account
-- baseline. Keep their D1 rows searchable without counting their bytes twice.
ALTER TABLE files ADD COLUMN baseline_accounted INTEGER NOT NULL DEFAULT 0
  CHECK (baseline_accounted IN (0,1));

CREATE TABLE IF NOT EXISTS b2_retained_versions (
  b2_file_id TEXT PRIMARY KEY NOT NULL,
  path TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  mime_type TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','deleting')),
  baseline_accounted INTEGER NOT NULL CHECK (baseline_accounted IN (0,1))
);
CREATE INDEX IF NOT EXISTS b2_retained_versions_cleanup
  ON b2_retained_versions(expires_at,created_at);

CREATE TABLE IF NOT EXISTS b2_pending_uploads (
  id TEXT PRIMARY KEY NOT NULL,
  path TEXT NOT NULL UNIQUE,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  mime_type TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  created_at TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS b2_pending_upload_reservation
BEFORE INSERT ON b2_pending_uploads
BEGIN
  SELECT CASE WHEN (SELECT verified_at FROM b2_storage_baseline WHERE singleton=1) IS NULL
    THEN RAISE(ABORT, 'B2_STORAGE_BASELINE_UNVERIFIED') END;
  SELECT CASE WHEN
    (SELECT account_bytes FROM b2_storage_baseline WHERE singleton=1) +
    (SELECT COALESCE(SUM(size_bytes),0) FROM files WHERE baseline_accounted=0) +
    (SELECT COALESCE(SUM(size_bytes),0) FROM b2_retained_versions WHERE baseline_accounted=0) +
    (SELECT COALESCE(SUM(size_bytes),0) FROM b2_pending_uploads) + NEW.size_bytes > 9200000000
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

DROP TRIGGER IF EXISTS files_reserve_storage_and_upload_quota;
CREATE TRIGGER files_reserve_storage_and_upload_quota
BEFORE INSERT ON files
WHEN NEW.status = 'pending'
BEGIN
  SELECT CASE WHEN (SELECT verified_at FROM b2_storage_baseline WHERE singleton=1) IS NULL
    THEN RAISE(ABORT, 'B2_STORAGE_BASELINE_UNVERIFIED') END;
  SELECT CASE WHEN
    (SELECT account_bytes FROM b2_storage_baseline WHERE singleton=1) +
    (SELECT COALESCE(SUM(size_bytes),0) FROM files WHERE baseline_accounted=0) +
    (SELECT COALESCE(SUM(size_bytes),0) FROM b2_retained_versions WHERE baseline_accounted=0) +
    (SELECT COALESCE(SUM(size_bytes),0) FROM b2_pending_uploads) + NEW.size_bytes > 9200000000
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

DROP TRIGGER IF EXISTS files_immutable_identity;
CREATE TRIGGER files_immutable_identity
BEFORE UPDATE ON files
WHEN OLD.id != NEW.id OR OLD.path != NEW.path OR OLD.created_at != NEW.created_at
BEGIN
  SELECT RAISE(ABORT, 'B2_FILE_IDENTITY_IMMUTABLE');
END;
