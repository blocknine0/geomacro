-- =============================================================================
-- Geomacro country-flash attribution hotfix
--
-- Production RSS smoke testing found that the generic demonym/alias "French"
-- could map a France macro headline to French Southern Territories (ATF) before
-- France (FRA). Remove that ambiguous short-form attribution from ATF while
-- preserving the full territory name for explicit ATF mentions.
--
-- Also repair the exact bad relation written by the 2026-09-09 smoke test.
-- =============================================================================

update public.live_country_registry
set
  aliases = coalesce(
    (
      select array_agg(alias_value order by ordinal_position)
      from unnest(aliases) with ordinality as alias_row(alias_value, ordinal_position)
      where lower(trim(alias_value)) <> 'french'
    ),
    '{}'::text[]
  ),
  demonyms = coalesce(
    (
      select array_agg(demonym_value order by ordinal_position)
      from unnest(demonyms) with ordinality as demonym_row(demonym_value, ordinal_position)
      where lower(trim(demonym_value)) <> 'french'
    ),
    '{}'::text[]
  ),
  updated_at = now()
where iso3 = 'ATF';

-- Repair the observed false-positive row from the live smoke test.
delete from public.live_flash_event_countries
where flash_id = 'forexlive_rss_1645c7bdaa7e35783522f56b13bcac2c'
  and country_iso3 = 'ATF';

update public.live_flash_event_countries
set is_primary = true
where flash_id = 'forexlive_rss_1645c7bdaa7e35783522f56b13bcac2c'
  and country_iso3 = 'FRA';
