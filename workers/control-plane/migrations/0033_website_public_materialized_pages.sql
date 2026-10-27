-- Public website/materialized 72h derived journalism only. NOT private OSINT,
-- commercial/signed products or B2. JSON pages are disposable projections.
CREATE TABLE IF NOT EXISTS website_derived_materialized_meta_v1 (
 id INTEGER PRIMARY KEY CHECK(id=1),
 data_revision INTEGER NOT NULL DEFAULT 0 CHECK(data_revision>=0),
 snapshot_revision INTEGER NOT NULL DEFAULT -1
);
INSERT OR IGNORE INTO website_derived_materialized_meta_v1
 (id,data_revision,snapshot_revision) VALUES(1,0,-1);
CREATE TABLE IF NOT EXISTS website_derived_materialized_pages_v1 (
 page_offset INTEGER PRIMARY KEY CHECK(page_offset IN (0,250,500)),
 data_revision INTEGER NOT NULL,
 generated_at TEXT NOT NULL,
 rows_json TEXT NOT NULL CHECK(length(rows_json)<=1650000)
);
-- The first snapshot is created after the next authorized empty sweep;
-- until then every public caller reads the canonical original table.
