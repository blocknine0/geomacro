#!/usr/bin/env bun
/** Protected held-cycle collection; no D1, B2, KV, R2, public news, or money.
 * This script MUST only be called on quota-HELD admission by a trusted main
 * production workflow. Output is AES-GCM ciphertext, suitable for an Actions
 * artifact, never an unencrypted private news payload.
 */
import {mkdirSync,writeFileSync} from "node:fs";
import {collectPrivateOsint15m} from "../lib/private-osint-15m-collector.mjs";
import {privateOsintRuntimeSources} from "../lib/private-osint-country-rotation.mjs";
import {privateOsintGlobalSources} from "../lib/private-osint-global-sources.mjs";
import {threeDomainGlobal20mPublisherRegistry} from "../lib/three-domain-global-direct-20m-sources.mjs";
import {privateOsintCountryMention} from "../lib/private-osint-country-mentions.mjs";
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195.ts";
import {normalizeReusableNewsJson} from "../../src/lib/reusable-news-json.ts";
import {sealPrivateOsintSpool,selectEligiblePrivateOsintSpoolItems} from "../lib/private-osint-encrypted-spool.mjs";

if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
 process.env.GITHUB_REF!=="refs/heads/main"||
 process.env.GEOMACRO_OSINT_SPOOL_ADMISSION!=="HELD"||
 !["schedule","workflow_dispatch","push","workflow_run"].includes(process.env.GITHUB_EVENT_NAME??""))
 throw Error("OSINT_SPOOL_PROTECTED_MAIN_HELD_ONLY");
const now=new Date(),root=process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN;
const threeDomain20m=process.env.GEOMACRO_SOURCE_REGISTRY_MODE==="THREE_DOMAIN_DIRECT_20M";
if(process.env.GEOMACRO_SOURCE_REGISTRY_MODE&&!threeDomain20m)
 throw Error("OSINT_HELD_SOURCE_MODE_UNRECOGNIZED");
if(threeDomain20m&&process.env.GITHUB_EVENT_NAME!=="schedule")
 throw Error("OSINT_DIRECT_20M_HELD_SCHEDULE_ONLY");
const sources=threeDomain20m?threeDomainGlobal20mPublisherRegistry(now).registry:
 privateOsintRuntimeSources(now,privateOsintGlobalSources(),
 COUNTRIES_195,{includeLocalGapLane:true});
const result=await collectPrivateOsint15m({
 now,registry:sources,normalize:normalizeReusableNewsJson,
 resolveCountry:title=>privateOsintCountryMention(title,COUNTRIES_195),
 onOriginalCandidate:null,
});
if(result.summary.source_endpoints_attempted!==sources.length||
 result.summary.configured_country_category_routes!==585||
 result.summary.configured_categories!==3||
 result.checks.length<sources.length)
 throw Error("OSINT_SPOOL_SOURCE_COVERAGE_INVALID");
const prepared=selectEligiblePrivateOsintSpoolItems(result.items,Date.now());
const envelope=sealPrivateOsintSpool({items:prepared.items,root,now:Date.now()});
if(envelope){
 const dest="/tmp/geomacro-encrypted-held-spool";
 mkdirSync(dest,{recursive:true,mode:0o700});
 writeFileSync(dest+"/sealed.json",JSON.stringify(envelope)+"\n",{mode:0o600});
}
console.log(JSON.stringify({
 schema:"geomacro.osint-held-spool-collection-receipt.v1",
 mode:"ENCRYPTED_QUOTA_HELD_PRIVATE_ONLY",checked_source_endpoints:sources.length,
 direct20m_three_domain_source_lane:threeDomain20m,
 direct20m_live_source_checks_verified:result.checks.length>=sources.length,
 durable_originals_in_d1_verified:false,
 b2_ciphertext_durable_verified:false,
 checked_country_routes:195,checked_categories:3,
 source_health_by_state:result.summary.source_states,
 captured_unverified_items:prepared.items.length,
 rejected_invalid_or_expired_source_items:prepared.invalid,
 deduplicated_source_items:prepared.duplicates,
 examined_source_items:prepared.examined,
 encrypted_artifact_emitted:envelope!==null,
 d1_writes:0,d1_canonical_readback_verified:false,
 b2_operations:0,r2_operations:0,kv_operations:0,
 public_news_published:false,commercial_delivery_enabled:false,
 no_raw_source_bytes_logged:true,source_native_clock_required:true,
}));
