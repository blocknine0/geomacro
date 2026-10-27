#!/usr/bin/env bun
/** Private-only unverified source production intake, isolated from public/paid APIs. */
import {createHmac} from "node:crypto";
import {collectPrivateUnverifiedOsint} from "../lib/private-unverified-osint-intake.mjs";
import {persistPrivateOsintBatch} from "../lib/private-osint-15m-durable-publisher.mjs";
import {normalizeReusableNewsJson} from "../../src/lib/reusable-news-json.ts";
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195.ts";
import {privateOsintCountryMention} from "../lib/private-osint-country-mentions.mjs";

const root=String(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").trim();
if(root.length<32||process.env.GEOMACRO_OSINT_RESEARCH_PRIVATE_ONLY!=="1")
 throw Error("UNVERIFIED_OSINT_PRIVATE_PRODUCTION_CREDENTIAL_REQUIRED");
const control=createHmac("sha256",root).update("geomacro-control-plane-v1").digest("hex");
const token=createHmac("sha256",control).update("geomacro-private-osint-15m-v1").digest("hex");
const batch=await collectPrivateUnverifiedOsint({
 normalize:normalizeReusableNewsJson,
 resolveCountry:title=>privateOsintCountryMention(title,COUNTRIES_195),
});
const proof=await persistPrivateOsintBatch({
 result:batch,privateToken:token,
 sourceHealthSnapshotSlots:3,
 controlPlaneRoot:"https://geomacro-control-plane.daspallab202391.workers.dev",
});
if(proof.source_checks_observed_this_tick!==batch.checks.length||
 proof.source_checks_persisted!==proof.source_checks_selected_for_d1||
 proof.source_checks_deferred_to_snapshot+proof.source_checks_persisted!==batch.checks.length||
 !proof.d1_write_exact_readback_verified||
 !proof.separate_private_d1_readback_verified||
 proof.publicly_delivered!==false||
 proof.signed_or_paid!==false)
 throw Error("UNVERIFIED_OSINT_PRIVATE_D1_ACCEPTANCE_FAILED");
// Aggregate-only logs. Raw metadata, articles and publisher URLs stay off Actions.
console.log(JSON.stringify({
 schema:"geomacro.private-unverified-osint-production-receipt.v1",
 candidate_endpoints:batch.summary.candidate_source_count,
 rss_candidates:batch.summary.native_feed_candidates,
 api_bulk_candidates:batch.summary.api_or_bulk_transport_only,
 source_checks_persisted:proof.source_checks_persisted,
 source_checks_observed_this_tick:proof.source_checks_observed_this_tick,
 source_checks_deferred_to_snapshot:proof.source_checks_deferred_to_snapshot,
 source_health_snapshot_cadence_nominal_minutes:proof.source_health_snapshot_cadence_nominal_minutes,
 private_news_json_persisted:proof.news_rows_verified_in_d1,
 source_states:batch.summary.source_states,
 durable_private_readback:true,commercially_verified:false,public_published:false,
 global_15_minute_guarantee:false,raw_urls_logged:false,
}));
