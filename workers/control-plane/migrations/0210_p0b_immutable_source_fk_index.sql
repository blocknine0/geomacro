-- P0B lookups/ACKs use candidate_sha256 or the B2 bundle index. The source
-- index is needed for foreign-key maintenance, which only uses source_id.
-- Indexing mutable state here rewrites this index on every queue transition.
-- Keep the source lookup and FK acceleration without indexing state twice.
-- No journal, identity constraint, source, pointer or ACK is removed.
DROP INDEX IF EXISTS idx_spool_source_id;
CREATE INDEX idx_spool_source_id ON ingestion_spool_queue(source_id);
