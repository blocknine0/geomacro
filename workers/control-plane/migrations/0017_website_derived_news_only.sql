-- Website-only durable derived Intelligence headlines, NOT raw source material.
-- No B2 hot snapshot, commercial, Supabase, country GRO or GRI use.
-- One id per ORIGINAL official release, preserving original date and 15m lag.
CREATE TABLE IF NOT EXISTS website_derived_intelligence (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 14 AND 24),
  category TEXT NOT NULL CHECK (category IN ('geopolitics','macro','rare_earth')),
  published_at TEXT NOT NULL,
  date_precision TEXT NOT NULL CHECK (date_precision IN ('exact','day')),
  story_json TEXT NOT NULL CHECK (length(story_json) BETWEEN 100 AND 4096),
  first_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_website_derived_intelligence_latest
 ON website_derived_intelligence (published_at DESC,id DESC);
