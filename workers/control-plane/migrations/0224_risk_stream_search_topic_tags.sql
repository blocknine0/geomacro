-- Add bounded search-bucket metadata to discovery-only global leads.
-- Existing rows use legacy metadata and remain unverified/non-commercial.
ALTER TABLE risk_stream_global_search_leads
 ADD COLUMN topic_bucket_id TEXT NOT NULL DEFAULT 'legacy'
 CHECK(length(topic_bucket_id) BETWEEN 1 AND 48);
ALTER TABLE risk_stream_global_search_leads
 ADD COLUMN topic_tags_json TEXT NOT NULL DEFAULT '[]'
 CHECK(json_valid(topic_tags_json) AND length(topic_tags_json)<=2048);
ALTER TABLE risk_stream_global_search_leads
 ADD COLUMN affected_assets_json TEXT NOT NULL DEFAULT '[]'
 CHECK(json_valid(affected_assets_json) AND length(affected_assets_json)<=2048);
