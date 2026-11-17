-- Add source-neutral rotating search taxonomy metadata to discovery-only leads.
-- Existing rows retain explicit legacy metadata; rights/evidence flags stay false.
ALTER TABLE risk_stream_global_search_leads
 ADD COLUMN topic_bucket_id TEXT NOT NULL DEFAULT 'legacy'
 CHECK(length(topic_bucket_id) BETWEEN 1 AND 48);
ALTER TABLE risk_stream_global_search_leads
 ADD COLUMN topic_tags_json TEXT NOT NULL DEFAULT '[]'
 CHECK(json_valid(topic_tags_json));
