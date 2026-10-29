import test from "node:test";
import assert from "node:assert/strict";
import { BGS_WORLD_MINERAL_STATISTICS_CANDIDATE as source } from "../lib/bgs-world-mineral-statistics-candidate.mjs";

test("BGS mineral statistics is registered as a global historical data candidate", () => {
  assert.equal(source.publisher, "British Geological Survey (BGS) / UKRI");
  assert.equal(source.category, "rare_earth");
  assert.equal(source.source_type, "historical_structured_dataset");
  assert.equal(source.host, new URL(source.items_url).hostname);
  assert.equal(new URL(source.collection_url).protocol, "https:");
  assert.equal(new URL(source.queryables_url).hostname, source.host);
  assert.equal(source.api_year_min, 1970);
  assert.equal(source.api_year_max, 2022);
  assert.ok(source.query_properties.includes("country_iso3_code"));
  assert.ok(source.query_properties.includes("bgs_commodity_trans"));
  assert.equal(source.freshness_class, "annual_or_historical_observation_not_current_news");
});

test("BGS commercial rights hold cannot be promoted by source registration", () => {
  assert.equal(source.commercial_rights_status, "permission_required_before_commercial_or_third_party_use");
  assert.equal(source.runtime_reader_enabled, false);
  assert.equal(source.paid_delivery_allowed, false);
});
