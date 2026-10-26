#!/usr/bin/env node
/**
 * Print a detailed local-publisher source-gap report.
 * Source-origin inventory is not event-country coverage.
 */
import {privateOsintGlobalSources,privateOsintPublisherCountryCoverage} from "../lib/private-osint-global-sources.mjs";

const sources=privateOsintGlobalSources();
const coverage=privateOsintPublisherCountryCoverage(sources,[],{includeDetails:true});
const report={generated_at:new Date().toISOString(),source_registry_count:sources.length,coverage};
process.stdout.write(JSON.stringify(report,null,2)+"\n");
