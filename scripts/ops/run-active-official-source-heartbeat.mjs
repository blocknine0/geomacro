#!/usr/bin/env node
/**
 * #1827 Supabase-free canonical orchestrator's live original-publisher
 * heartbeat. Fixes retired 3-feed sampler's repeated failure by using the
 * same 11 real active publishers / 3 transparent quarantines as the
 * independent 90-minute production source lane.
 *
 * This is SOURCE TRANSPORT health, not scored country/event intelligence.
 * No B2 GET/PUT, D1 mutation, Supabase or payment.
 */
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {probeExpandedOfficialMesh} from "./probe-expanded-official-source-mesh.mjs";
import {auditOfficialStep1Feeds} from "./audit-official-step1-feed-redundancy.mjs";

export function summarizeOrchestratorOfficialSourceHeartbeat(sourceReceipt){
  const audit=auditOfficialStep1Feeds(sourceReceipt);
  if(sourceReceipt?.active_source_count!==11 ||
     sourceReceipt?.quarantined_source_count!==3 ||
     !Array.isArray(sourceReceipt.sources) ||
     sourceReceipt.sources.some(row=>row.commercial_eligible!==false ||
       row.commercial_rights_verified!==false ||
       row.current_scored_intelligence_verified!==false))
    throw Error("ORCHESTRATOR_OFFICIAL_SOURCE_RECEIPT_UNTRUSTED");
  const activeHealthy=sourceReceipt.active_source_transport_healthy===true &&
    audit.source_transport_live_failure_count===0 &&
    audit.per_category_two_independent_issuers_transport_healthy===true &&
    sourceReceipt.status==="ACTIVE_SOURCE_TRANSPORT_OBSERVED_WITH_QUARANTINE";
  return {
    schema:"geomacro.orchestrator-active-official-source-heartbeat.v1",
    checked_at:sourceReceipt.observed_at,
    status:activeHealthy?"ACTIVE_ORIGINAL_ISSUERS_TRANSPORT_HEALTHY":
      "ACTIVE_ORIGINAL_ISSUERS_TRANSPORT_DEGRADED",
    source_transport_ok:activeHealthy,
    original_issuer_quorum_by_category:audit.categories.map(c=>({
      category:c.category,independent_healthy_issuers:c.transport_healthy_independent_issuers,
      minimum_two_issuers_ok:c.two_independent_original_transport_floor_met,
    })),
    sources_active:sourceReceipt.active_source_count,
    sources_quarantined:sourceReceipt.quarantined_source_count,
    active_source_failures:audit.source_transport_live_failure_count,
    quarantined_not_polled:audit.source_transport_quarantined_not_polled_count,
    original_24h_topical_counts:sourceReceipt.original_publisher_native_24h_topic_counts,
    country_article_relevance_and_rights_verified:false,
    same_event_corrob_verified:false,
    signed_live_gro_verified:false,
    no_current_event_implied:false,
    commercial_eligible:false,
    supabase_reads:0,supabase_writes:0,d1_writes:0,b2_requests:0,payment_performed:false,
  };
}
export async function runActiveOrchestratorSourceHeartbeat({fetchImpl=fetch,now=new Date()}={}){
  const sourceReceipt=await probeExpandedOfficialMesh({fetchImpl,now});
  const proof=summarizeOrchestratorOfficialSourceHeartbeat(sourceReceipt);
  mkdirSync("artifacts/official-native-rss",{recursive:true});
  // Sanitized, no raw article text or URL. Historical blocked endpoints
  // still explicitly appear QUARANTINED in source receipt and counts.
  writeFileSync("artifacts/official-native-rss/three-domains.json",JSON.stringify(proof,null,2)+"\n",{mode:0o600});
  return proof;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const proof=await runActiveOrchestratorSourceHeartbeat();
    console.log(JSON.stringify(proof));
    if(!proof.source_transport_ok)process.exitCode=3;
  }catch{
    // No source URL, article title, or HTTP body in error logs.
    console.error("ORCHESTRATOR_ACTIVE_OFFICIAL_SOURCE_UNVERIFIED");process.exitCode=2;
  }
}
