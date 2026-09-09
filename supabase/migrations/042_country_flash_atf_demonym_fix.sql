-- =============================================================================
-- Geomacro country-flash attribution hotfix
--
-- Production RSS smoke testing found that the generic demonym/alias "French"
-- could map a France macro headline to French Southern Territories (ATF) before
-- France (FRA). Remove that ambiguous short-form attribution from ATF while
-- preserving the full territory name for explicit ATF mentions.
--
-- Existing smoke-test flash rows remain immutable evidence. They are still
-- UNVERIFIED and are not scoring-eligible, so this migration only prevents the
-- false attribution from being written on future ingests.
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
