/**
 * Official BGS mineral-statistics API candidate. This is deliberately a
 * source-admission record, not an enabled customer reader: BGS says commercial
 * use or third-party provision requires permission from the relevant owner.
 */
export const BGS_WORLD_MINERAL_STATISTICS_CANDIDATE = Object.freeze({
  id: "bgs_world_mineral_statistics",
  publisher: "British Geological Survey (BGS) / UKRI",
  category: "rare_earth",
  source_type: "historical_structured_dataset",
  landing_url: "https://www.bgs.ac.uk/mineralsuk/statistics/world-mineral-statistics/world-mineral-statistics-data-download/",
  collection_url: "https://ogcapi.bgs.ac.uk/collections/world-mineral-statistics",
  items_url: "https://ogcapi.bgs.ac.uk/collections/world-mineral-statistics/items",
  queryables_url: "https://ogcapi.bgs.ac.uk/collections/world-mineral-statistics/queryables",
  host: "ogcapi.bgs.ac.uk",
  coverage: "Global country/commodity production and trade statistics",
  api_year_min: 1970,
  api_year_max: 2022,
  query_properties: Object.freeze([
    "year",
    "bgs_statistic_type_trans",
    "bgs_commodity_trans",
    "bgs_sub_commodity_trans",
    "country_trans",
    "country_iso3_code",
  ]),
  freshness_class: "annual_or_historical_observation_not_current_news",
  commercial_rights_status: "permission_required_before_commercial_or_third_party_use",
  runtime_reader_enabled: false,
  paid_delivery_allowed: false,
});

