-- B2-free-tier gateway metadata and atomic admission controls.
-- The baseline is ACCOUNT-WIDE B2 storage already present before this worker
-- is enabled. It must be verified from the Backblaze console and imported
-- without calling a B2 list API. New objects are uniquely named and tracked.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY NOT NULL,
  path TEXT NOT NULL UNIQUE,
  b2_file_id TEXT,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  mime_type TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  created_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','ready','deleting')),
  visibility TEXT NOT NULL CHECK (visibility IN ('public','private')),
  expires_at TEXT,
  last_accessed_at TEXT,
  baseline_accounted INTEGER NOT NULL DEFAULT 0 CHECK (baseline_accounted IN (0,1)),
  evictable INTEGER NOT NULL DEFAULT 1 CHECK (evictable IN (0,1))
);

CREATE INDEX IF NOT EXISTS files_cleanup_order
  ON files(status, evictable, expires_at, last_accessed_at, created_at);
CREATE INDEX IF NOT EXISTS files_public_ready
  ON files(id, visibility, status);

CREATE TABLE IF NOT EXISTS b2_storage_baseline (
  singleton INTEGER PRIMARY KEY NOT NULL CHECK (singleton = 1),
  account_bytes INTEGER NOT NULL CHECK (account_bytes >= 0),
  verified_at TEXT
);
INSERT OR IGNORE INTO b2_storage_baseline(singleton, account_bytes, verified_at)
VALUES (1, 0, NULL);

CREATE TABLE IF NOT EXISTS b2_daily_usage (
  day_utc TEXT PRIMARY KEY NOT NULL CHECK (length(day_utc) = 10),
  upload_requests INTEGER NOT NULL DEFAULT 0 CHECK (upload_requests >= 0),
  class_a_calls INTEGER NOT NULL DEFAULT 0 CHECK (class_a_calls >= 0),
  class_b_calls INTEGER NOT NULL DEFAULT 0 CHECK (class_b_calls >= 0),
  class_c_calls INTEGER NOT NULL DEFAULT 0 CHECK (class_c_calls = 0),
  blocked_reason TEXT,
  updated_at TEXT NOT NULL
);

-- One pending file row reserves its bytes and one Class-A/upload ticket in the
-- same SQLite write transaction before the Worker starts a B2 PutObject.
CREATE TRIGGER IF NOT EXISTS files_reserve_storage_and_upload_quota
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

CREATE TRIGGER IF NOT EXISTS files_immutable_identity
BEFORE UPDATE ON files
WHEN OLD.id != NEW.id OR OLD.path != NEW.path OR OLD.size_bytes != NEW.size_bytes OR
     OLD.sha256 != NEW.sha256 OR OLD.created_at != NEW.created_at
BEGIN
  SELECT RAISE(ABORT, 'B2_FILE_IDENTITY_IMMUTABLE');
END;
