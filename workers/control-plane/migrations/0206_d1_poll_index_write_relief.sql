-- Consolidate the two mutable due-time indexes into one covering index.
-- Preserve source-ID tie ordering and dispatch-lease coverage. Existing
-- primary/UNIQUE constraints continue enforcing candidate identity.
DROP INDEX IF EXISTS idx_p1_dispatch_due;
CREATE INDEX idx_p1_dispatch_due
 ON source_registry(enabled,next_poll_at,source_id,poll_dispatch_lease_until);
DROP INDEX IF EXISTS idx_p0a_registry_due;
-- candidate_sha256 already has an identical UNIQUE index from migration 0114.
DROP INDEX IF EXISTS idx_spool_candidate_sha;
