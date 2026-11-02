-- GDELT native B2+D1 cutover: verified private B2 artifact identity
-- linked to canonical indexed D1 event candidates. No Supabase dependency.
ALTER TABLE risk_gate_gdelt_event_index ADD COLUMN b2_archive_key TEXT;
ALTER TABLE risk_gate_gdelt_event_index ADD COLUMN b2_manifest_sha256 TEXT;
CREATE INDEX IF NOT EXISTS idx_rg_gdelt_b2_pinned
 ON risk_gate_gdelt_event_index(b2_manifest_sha256,gdelt_index_at DESC);
