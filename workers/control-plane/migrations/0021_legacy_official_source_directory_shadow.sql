-- One-time protected cutover of original legacy Supabase official-source
-- directories. This is a PRIVATE D1 shadow ONLY, never automatically enabled
-- as a live source or published to public/partner intelligence endpoints.
CREATE TABLE IF NOT EXISTS legacy_official_source_directory_shadow (
  dataset TEXT NOT NULL CHECK(dataset IN ('primary','statistics','monetary','critical_minerals')),
  country_iso2 TEXT NOT NULL CHECK(length(country_iso2)=2 AND country_iso2=upper(country_iso2)),
  source_row_json TEXT NOT NULL CHECK(json_valid(source_row_json)),
  source_row_sha256 TEXT NOT NULL CHECK(length(source_row_sha256)=64),
  verification_state TEXT NOT NULL CHECK(length(verification_state)<=96),
  copied_at TEXT NOT NULL,
  PRIMARY KEY(dataset,country_iso2)
);
CREATE INDEX IF NOT EXISTS idx_legacy_official_source_directory_shadow_dataset
ON legacy_official_source_directory_shadow(dataset,country_iso2);
-- Deliberately no triggers into live publishers / products.
