#!/usr/bin/env bun
/** Production source-only governor lane: existing 15m pinned feeds -> at most
 * the provider-authorized five Phase 2H D1 originals. Does NOT publish website
 * cards, persist the broad OSINT health ring, use B2, sign, settle or touch
 * PREDGE. Used only when critical/research publication is held but the
 * independent source_intake lane has positive provider approval. The actual
 * Free minimum lane may run during CRITICAL_ONLY (critical=true, research=false):
 * no full OSINT health ring, speculative research, signing or public output.
 */
import {createHmac} from "node:crypto";
import {collectPrivateOsint15m} from "../lib/private-osint-15m-collector.mjs";
import {privateOsintRuntimeSources} from "../lib/private-osint-country-rotation.mjs";
import {privateOsintGlobalSources} from "../lib/private-osint-global-sources.mjs";
import {privateOsintCountryMention} from "../lib/private-osint-country-mentions.mjs";
import {stagePhase2iOsintFairRaw} from "../lib/phase2i-osint-country-fair-raw-staging.mjs";
import {createPhase2iSingleSweepOriginalIndex} from "../lib/phase2i-single-sweep-original-index.mjs";
import {PRIVATE_OSINT_TOPICS} from "../lib/private-osint-global-sources.mjs";
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195.ts";
import {normalizeReusableNewsJson} from "../../src/lib/reusable-news-json.ts";
import {deriveStatelessSignals} from "../../src/lib/stateless-intelligence-model.ts";

const env=process.env;
if(env.GITHUB_ACTIONS!=="true"||
 env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
 env.GITHUB_REF!=="refs/heads/main"||
 env.GEOMACRO_SOURCE_INTAKE_ONLY!=="1"||
 env.PHASE2I_PROVIDER_SOURCE_INTAKE!=="true"||
 !["true","false"].includes(env.PHASE2I_PROVIDER_CRITICAL??"")||
 env.PHASE2I_PROVIDER_RESEARCH!=="false"||
 ![3,5,10,25,50].includes(Number(env.PHASE2I_PROVIDER_MAX_NEW_ROWS)))
 throw Error("PHASE2I_SOURCE_ONLY_PROVIDER_ADMISSION_REQUIRED");
// Spend no more than the live provider admission. Five is the existing
// D1 collision-isolation batch cap, NOT an authority to exceed a 3-row slot.
const providerRows=Number(env.PHASE2I_PROVIDER_MAX_NEW_ROWS);
const admittedRows=Math.min(providerRows,5);
const root=String(env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").trim();
if(root.length<32)throw Error("PHASE2I_SOURCE_ONLY_PRIVATE_AUTH_REQUIRED");
const controlToken=createHmac("sha256",root)
 .update("geomacro-control-plane-v1").digest("hex");
const now=new Date();
const registry=privateOsintRuntimeSources(now,privateOsintGlobalSources(),
 COUNTRIES_195,{includeLocalGapLane:true});
const pinnedCategories=new Map(registry.map(source=>[source.url,source.categories]));
const singleSweep=createPhase2iSingleSweepOriginalIndex({
 pinnedCategories,topics:PRIVATE_OSINT_TOPICS,
});
const result=await collectPrivateOsint15m({
 now,registry,normalize:normalizeReusableNewsJson,
 resolveCountry:title=>privateOsintCountryMention(title,COUNTRIES_195),
 onOriginalCandidate:singleSweep.observe,
});
if(result.summary.configured_country_routes!==195||
 result.summary.configured_country_category_routes!==585||
 result.summary.configured_categories!==3||
 result.summary.source_endpoints_attempted!==result.summary.registered_source_endpoints)
 throw Error("PHASE2I_SOURCE_ONLY_195X3_SOURCE_SWEEP_UNVERIFIED");
const indexed=singleSweep.finish();
const stage=await stagePhase2iOsintFairRaw({
 candidates:indexed.candidates,now,derive:deriveStatelessSignals,
 maxRows:admittedRows,
 controlPlaneRoot:"https://geomacro-control-plane.daspallab202391.workers.dev",
 token:controlToken,
});
if(stage.selected_count>0&&stage.d1_readback_verified!==true)
 throw Error("PHASE2I_SOURCE_ONLY_RAW_D1_RECEIPT_UNVERIFIED");
const {schema,status,selected_count,available_originals,deferred_count,
 selected_by_category,d1_inserted,d1_unchanged,d1_rejected_conflicts,
 d1_readback_verified,b2_verified}=stage;
console.log(JSON.stringify({
 schema,status,source_intake_lane_only:true,
 country_routes:195,country_category_routes:585,
 source_endpoints_attempted:result.summary.source_endpoints_attempted,
 ...indexed.summary,
 selected_count,available_originals,deferred_count,selected_by_category,
 admitted_source_only_max_rows:admittedRows,
 d1_inserted,d1_unchanged,d1_rejected_conflicts,d1_readback_verified,
 b2_verified,rights_verified:false,paid_eligible:false,payments:0,
 predge_modified:false,publication_attempted:false,
 no_extra_provider_news_gets:true,
}));
