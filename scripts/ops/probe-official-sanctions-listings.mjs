#!/usr/bin/env node
import {mkdirSync,writeFileSync} from "node:fs";
import {observeOfficialSanctionsListings} from "../lib/official-sanctions-listings-observer.mjs";
const OUT="artifacts/official-sanctions-listings/receipt.json";
const live=process.argv.includes("--live");
const hourlyGate=process.argv.includes("--ofac-hourly-slot");
const now=new Date();
// Existing 12/42 UTC 30m runner: target one OFAC GET per UTC hour.
// A delayed GitHub schedule can cross an hour boundary; this stateless gate
// is a nominal rate reduction, NOT a durable per-hour request governor.
// Skipped half-hour is explicitly NO-PROBE, not a source freshness heartbeat.
const due=!hourlyGate||now.getUTCMinutes()<30;
const result=live&&due?await observeOfficialSanctionsListings({
 now,onlySourceId:hourlyGate?"ofac_sanctions_list_updates":null
}):{
 schema:"geomacro.official-sanctions-listings-observation.v1",
 checked_at:new Date().toISOString(),mode:hourlyGate&&!due?"SKIPPED_NOT_THIS_HOURLY_SLOT":"OFFLINE_NO_SOURCE_CALLS",
 sources:[],source_count:0,reachable_sources:0,
 fully_qualified_event_count:0,applies_to_country_category_cells_verified:0,
 ofac_rss_retired:true,unsc_rss_access_approved:false,
 live_event_source_page_verified:false,signed_paid_event_verified:false,
 requests_attempted:0,payments:0,d1_writes:0,b2_requests:0,predge_modified:false
};
mkdirSync("artifacts/official-sanctions-listings",{recursive:true});
writeFileSync(OUT,JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify({schema:result.schema,source_count:result.source_count,
 status:result.sources.map(s=>({id:s.id,state:s.status,http_status:s.http_status,
  dated_listing_candidates:s.source_native_listing_date_candidates??0})),
 qualified_events:result.fully_qualified_event_count,paid:false,requests:result.requests_attempted}));
