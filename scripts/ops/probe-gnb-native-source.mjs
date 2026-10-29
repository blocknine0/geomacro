#!/usr/bin/env node
/** Exact registered Guinea-Bissau publisher-source transport / native-clock acceptance.
 * Real production collector and local registry only; GET no D1, B2, or customer output.
 */
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {privateLocalPublisherCandidates} from "../lib/private-osint-local-publisher-rotation.mjs";
import {collectPrivateOsint15m} from "../lib/private-osint-15m-collector.mjs";
const ID="private_gaplane_gnb_ang_agency";
const sources=privateLocalPublisherCandidates().filter(x=>x.id===ID);
if(sources.length!==1||sources[0].publisher_country_iso3!=="GNB"||
 sources[0].url!=="https://ang.gw/feed/"||sources[0].private_only===false)
 throw Error("GNB_EXACT_NATIVE_SOURCE_NOT_REGISTERED");
const output=resolve(process.env.RUNNER_TEMP??"/tmp","geomacro-195x3-query-regression");
mkdirSync(output,{recursive:true});
const normalize=item=>({
 schema:"geomacro.reusable-news-json.v1",
 category:item.category,country_iso3:item.country_iso3??null,
 source:{publisher_name:null,original_url:null,original_published_at:item.published_at},
 usage_rights:{commercial_reuse_authorized:false},
 delivery:{raw_article_included:false},
});
let state={schema:"geomacro.gnb-native-source-check.v1",
 checked_at:new Date().toISOString(),publisher_country_iso3:"GNB",
 source_registration_count:1,source_requests_executed:0,
 states:[],native_dated_candidates:0,
 source_publisher_country_is_event_country:false,original_event_country_verified:false,
 commercial_eligible:false,signed_paid_delivery_verified:false,source_content_logged:false,
 d1_writes:0,b2_requests:0,payments:0,predge_modified:false};
if(process.argv.includes("--live")){
 try{
  const r=await collectPrivateOsint15m({
   now:new Date(),registry:sources,normalize,resolveCountry:()=>null,concurrency:1,
  });
  if(r.summary.source_endpoints_attempted!==1 ||r.checks.length!==3)
   throw Error("GNB_NATIVE_SOURCE_COLLECTOR_CONTRACT_INVALID");
  state={...state,source_requests_executed:1,states:r.checks.map(x=>({
    category:x.category,state:x.state
  })),native_dated_candidates:r.items.length,
   source_country_rss_transport_healthy:r.checks.every(x=>
    ["OBSERVED","EMPTY_OR_OUTSIDE_WINDOW"].includes(x.state)),
  };
 }catch(e){
  state={...state,source_requests_executed:1,
   error_code:/^GNB_[A-Z_]+$/u.test(String(e?.message))?e.message:"GNB_NATIVE_SOURCE_PROBE_UNAVAILABLE",
   source_country_rss_transport_healthy:false,
  };
 }
}
writeFileSync(output+"/gnb-local-original-source-readonly.json",JSON.stringify(state,null,2)+"\n");
console.log(JSON.stringify({schema:state.schema,source_requests_executed:state.source_requests_executed,
 states:state.states,candidates:state.native_dated_candidates,
 source_country_rss_transport_healthy:state.source_country_rss_transport_healthy??false,
 commercial_eligible:false,payments:0}));
