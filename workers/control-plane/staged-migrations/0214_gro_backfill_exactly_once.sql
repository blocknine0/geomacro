-- Step 2 reviewed candidate, intentionally NOT in protected 0204-0211 queue.
-- One and only one historical enumeration after migration 0120; new B2-ACKed
-- originals continue to enqueue via trg_phase2h_b2_archive_gro_enqueue.
-- Repeating the 0..end raw-table scan every 2 minutes is not permitted after
-- completion. Enable GEOMACRO_GRO_BACKFILL_ONCE_V1 only after this migration
-- and a production readback of its column/trigger.
ALTER TABLE gro_evidence_backfill_state
 ADD COLUMN scan_complete INTEGER NOT NULL DEFAULT 0
 CHECK(scan_complete IN (0,1));
CREATE INDEX IF NOT EXISTS idx_gro_evidence_jobs_pending_v2
 ON gro_evidence_jobs(enqueued_at,record_id) WHERE state='PENDING';
