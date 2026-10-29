/**
 * Official BGS mineral-statistics API. Raw records are fetched ephemerally
 * for a query-scoped derived answer; raw rows are not retained or sent to users.
 * Commercial rights are tracked separately from source access.
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
  commercial_rights_status: "not_reviewed_separately",
  runtime_reader_enabled: true,
  raw_response_persisted: false,
  structured_derived_output_enabled: true,
  raw_upstream_delivery_allowed: false,
  paid_delivery_allowed: false,
});

