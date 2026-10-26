#!/usr/bin/env node
/**
 * Offline registry audit for the 195-country × 3-category OSINT source grid.
 * Publisher-country sources, same-continent fallbacks, global fallbacks,
 * and live observed public Finds are different coverage dimensions.
 */
import {
 privateOsintGlobalSources,
 privateOsintPublisherCountryCoverage,
 privateOsintCountryCategoryCoverage,
} from "../lib/private-osint-global-sources.mjs";

const sources=privateOsintGlobalSources();
const publisherCountryCoverage=privateOsintPublisherCountryCoverage(sources,[],{includeDetails:true});
const sourceCoverageMatrix=privateOsintCountryCategoryCoverage(sources,[],[],{includeCells:true});
const report={
 generated_at:new Date().toISOString(),
 source_registry_count:sources.length,
 publisher_country_inventory:publisherCountryCoverage,
 country_category_source_coverage:sourceCoverageMatrix,
 live_health_scope:"NOT_PROBED_BY_THIS_OFFLINE_COMMAND",
 public_finds_observation_scope:"SEPARATE_LIVE_72H_ARCHIVE_ENDPOINT",
};
process.stdout.write(JSON.stringify(report,null,2)+"\n");
