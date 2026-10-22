-- Confidential historical preservation only. This schema is not exposed by
-- any public Worker route, provides no customer authentication or billing.
-- Insert exact source snapshots only through protected one-off GitHub workflow.
CREATE TABLE IF NOT EXISTS legacy_customer_private_shadow (
 snapshot_hash TEXT NOT NULL CHECK(length(snapshot_hash)=64),
 source_table TEXT NOT NULL,
 row_id TEXT NOT NULL,
 private_row_json TEXT NOT NULL,
 row_sha256 TEXT NOT NULL CHECK(length(row_sha256)=64),
 PRIMARY KEY(snapshot_hash,source_table,row_id)
);
CREATE TABLE IF NOT EXISTS legacy_customer_private_shadow_receipts (
 snapshot_hash TEXT PRIMARY KEY CHECK(length(snapshot_hash)=64),
 source_project TEXT NOT NULL,
 row_count INTEGER NOT NULL CHECK(row_count>=0),
 table_count INTEGER NOT NULL CHECK(table_count=14),
 checked_at TEXT NOT NULL
);
-- Deliberately do not add ANY public read/write route or access token.
