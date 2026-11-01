-- Optional owner-published research-only signed pilot sample.
-- One immutable verified envelope at a time; no articles, no GRO or paid authority.
CREATE TABLE IF NOT EXISTS predge_pilot_signed_news_context (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  envelope_json TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64),
  updated_at TEXT NOT NULL
);
