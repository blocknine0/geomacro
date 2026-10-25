-- Reduce bounded 72h newsroom retention-sweep scans without changing data.
-- The table already has an index led by published_at for ordered public reads.
-- This index helps retention cleanup on the independent first-ingest clock.
CREATE INDEX IF NOT EXISTS idx_website_derived_intelligence_first_seen
  ON website_derived_intelligence (first_seen_at DESC);
