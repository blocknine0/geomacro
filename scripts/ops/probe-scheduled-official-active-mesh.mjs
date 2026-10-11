#!/usr/bin/env node
/**
 * #1827 canonical scheduled source heartbeat must use the same ACTIVE official
 * issuer mesh as production; the old narrow three-URL probe still hits
 * quarantined USGS and therefore always turns the D1 scheduler cursor red.
 * Read-only, bounded, no new D1/B2/Supabase write and no scoring.
 */
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {probeExpandedOfficialMesh} from "./probe-expanded-official-source-mesh.mjs";
import {auditOfficialStep1Feeds} from "./audit-official-step1-feed-redundancy.mjs";

const CATEGORIES=Object.freeze(["geopolitics","macro","rare_earth"]);
export function classifyScheduledOriginalMesh(transport){
  const audit=auditOfficialStep1Feeds(transport);
  const categories=CATEGORIES.map(domain=>{
    const c=audit.categories.find(x=>x.category===domain);
    if(!c)throw Error("OFFICIAL_SCHEDULED_DOMAIN_MISSING");
    return {
      category:domain,
      sampled_original_issuer_count:c.sampled_original_issuers,
      active_original_issuer_count:c.transport_healthy_independent_issuers,
      independent_original_transport_floor_met:c.two_independent_original_transport_floor_met,
      original_topics_within_24h:transport.original_publisher_native_24h_topic_counts?.[domain]??0,
      article_country_relevance_verified:false,
      article_commercial_rights_verified:false,
      current_scored_event_verified:false,
    };
  });
  const activeOk=transport.active_source_transport_healthy===true &&
    transport.active_source_count===11 &&
    transport.quarantined_source_count===3 &&
    audit.source_transport_live_failure_count===0 &&
    audit.per_category_two_independent_issuers_transport_healthy===true;
  return {
    schema:"geomacro.scheduled-official-active-mesh.v1",
    observed_at:transport.observed_at,
    status:activeOk?"ACTIVE_OFFICIAL_ISSUERS_HEALTHY":"ACTIVE_OFFICIAL_ISSUERS_DEGRADED",
    active_original_transport_floor_met:activeOk,
    active_source_count:transport.active_source_count,
    quarantined_not_polled:transport.quarantined_source_count,
    active_transport_failures:audit.source_transport_live_failure_count,
    // Explicitly separate reachable official publishers from fresh verified
    // original events. Never resurrect paused scoring or payment via heartbeat.
    original_events_qualified_for_scoring:0,
    per_article_country_relevance_verified:false,
    original_article_derived_use_rights_verified:false,
    signed_current_intelligence_verified:false,
    supabase_reads:0,supabase_writes:0,d1_writes:0,b2_requests:0,
    commercial_eligible:false,payment_performed:false,
    categories,
  };
}
export async function probeScheduledOriginalMesh({fetchImpl=fetch,now=new Date()}={}){
  const receipt=await probeExpandedOfficialMesh({fetchImpl,now});
  return classifyScheduledOriginalMesh(receipt);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const proof=await probeScheduledOriginalMesh();
    mkdirSync("artifacts/official-native-rss",{recursive:true});
    writeFileSync("artifacts/official-native-rss/three-domains.json",
      JSON.stringify(proof,null,2)+"\n",{mode:0o600});
    console.log(JSON.stringify({status:proof.status,active_source_count:proof.active_source_count,
      quarantined_not_polled:proof.quarantined_not_polled,
      active_transport_failures:proof.active_transport_failures,
      original_events_qualified_for_scoring:0,commercial_eligible:false,
      categories:proof.categories}));
    if(!proof.active_original_transport_floor_met)process.exitCode=3;
  }catch{
    console.error("OFFICIAL_SCHEDULED_ACTIVE_MESH_RECEIPT_INVALID");process.exitCode=2;
  }
}
