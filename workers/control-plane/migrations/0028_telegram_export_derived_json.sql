-- Owner-exported Telegram Desktop JSON -> private derived-only research, separate
-- from verified publisher originals and public/paid reusable RSS news.
CREATE TABLE IF NOT EXISTS telegram_export_derived_items (
 item_id TEXT PRIMARY KEY CHECK(length(item_id)=64),
 source_object_sha256 TEXT NOT NULL CHECK(length(source_object_sha256)=64),
 private_chat_sha256 TEXT NOT NULL CHECK(length(private_chat_sha256)=64),
 private_text_sha256 TEXT NOT NULL CHECK(length(private_text_sha256)=64),
 category TEXT NOT NULL CHECK(category IN ('geopolitics','macro','rare_earth')),
 country_iso3 TEXT CHECK(country_iso3 IS NULL OR (length(country_iso3)=3 AND country_iso3 GLOB '[A-Z][A-Z][A-Z]')),
 source_native_published_at TEXT,
 observed_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 projection_json TEXT NOT NULL CHECK(length(projection_json) BETWEEN 200 AND 2000),
 verified INTEGER NOT NULL DEFAULT 0 CHECK(verified=0),
 commercial_rights_verified INTEGER NOT NULL DEFAULT 0 CHECK(commercial_rights_verified=0),
 scored INTEGER NOT NULL DEFAULT 0 CHECK(scored=0),
 signed INTEGER NOT NULL DEFAULT 0 CHECK(signed=0),
 chargeable INTEGER NOT NULL DEFAULT 0 CHECK(chargeable=0)
);
CREATE INDEX IF NOT EXISTS idx_telegram_export_derived_72h
 ON telegram_export_derived_items(observed_at DESC,item_id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_export_derived_dedupe
 ON telegram_export_derived_items(private_text_sha256);
CREATE TABLE IF NOT EXISTS telegram_export_processed_objects (
 object_sha256 TEXT PRIMARY KEY CHECK(length(object_sha256)=64),
 processed_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 accepted_items INTEGER NOT NULL CHECK(accepted_items BETWEEN 0 AND 20)
);
