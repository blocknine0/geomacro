#!/usr/bin/env node
/** Independent corridor-only source receipt. No website publisher imported. */
import {mkdirSync,writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {collectDirectCorridorSourceIntake} from "../lib/direct-global-corridor-ingestion.mjs";
import {buildPrivateCorridorStructuredResearch} from "../lib/corridor-derived-structured-research.mjs";
export async function runDirectCorridorIntake({
 observe=collectDirectCorridorSourceIntake
}={}){
 const receipt=await observe();
 if(receipt.source_count!==37||receipt.source_link_occurrences!==39||
    receipt.unique_linked_sources!==37||receipt.source_checks?.length!==37||
    receipt.source_checks.reduce((sum,s)=>sum+s.reference_count,0)!==39)
   throw Error("DIRECT_CORRIDOR_UPLOADED_LINK_PARITY_FAILURE");
 if(receipt.channel!=="CORRIDOR_ONLY"||
    receipt.website_intelligence_writes!==0||
    receipt.website_intelligence_enabled!==false||
    receipt.d1_writes!==0||receipt.b2_writes!==0||
    receipt.supabase_writes!==0||receipt.chargeable!==false)
   throw Error("DIRECT_CORRIDOR_OUTPUT_BOUNDARY_INVALID");
 // Fail closed if any candidate breaks publisher provenance, age or isolation.
 if(receipt.native_news_sources_polled!==6||
    !Number.isSafeInteger(receipt.news_candidate_count)||
    receipt.news_candidate_count<0||receipt.news_candidate_count>160||
    receipt.news_candidate_count!==receipt.news_candidates?.length||
    receipt.news_candidate_retention_hours!==72||
    receipt.news_candidates.some(item=>
      typeof item.id!=="string"||!/^[a-f0-9]{64}$/u.test(item.id)||
      !/^https:\/\//u.test(item.article_url)||
      !/^https:\/\//u.test(item.original_publisher_url)||
      !Number.isFinite(Date.parse(item.published_at))||
      new Date(receipt.checked_at).getTime()-Date.parse(item.published_at)>72*3600000||
      item.commercial_rights_verified!==false||
      item.customer_delivery_enabled!==false||
      item.source_time_is_not_event_time!==true||
      item.original_article_verified!==false))
   throw Error("CORRIDOR_NATIVE_NEWS_PROVENANCE_INVALID");
 if(!Array.isArray(receipt.official_reference_source_checks)||
    receipt.official_reference_source_checks.length!==9||
    receipt.official_reference_observation_count!==
      receipt.official_reference_observations?.length||
    receipt.official_reference_observation_count>60||
    receipt.official_reference_observations.some(item=>
      typeof item.id!=="string"||!/^[a-f0-9]{64}$/u.test(item.id)||
      item.context_only!==true||item.commercial_rights_verified!==false||
      item.customer_delivery_enabled!==false||
      item.independently_verified_event!==false))
   throw Error("CORRIDOR_OFFICIAL_PROVENANCE_INVALID");
 // Automatically transform normalized source observations to GeoMacro-owned
 // five-part PRIVATE research. No monetization or source-license bypass.
 const structured=buildPrivateCorridorStructuredResearch({sourceReceipt:receipt});
 if(structured.structured_record_count!==receipt.official_reference_observation_count||
    structured.source_article_candidates_not_converted!==receipt.news_candidate_count||
    structured.commercial_eligible!==false||
    structured.customer_delivery_authorized!==false||
    structured.website_intelligence_writes!==0||structured.predge_writes!==0)
   throw Error("CORRIDOR_PRIVATE_STRUCTURED_OUTPUT_BOUNDARY_INVALID");
 const dir="artifacts/direct-corridor-intake";
 mkdirSync(dir,{recursive:true,mode:0o700});
 writeFileSync(dir+"/receipt.json",JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
 writeFileSync(dir+"/news-candidates.json",JSON.stringify({
   schema:"geomacro.corridor-native-news-candidates.v1",
   channel:"CORRIDOR_ONLY",checked_at:receipt.checked_at,
   source_count:receipt.source_count,
   native_news_sources_polled:receipt.native_news_sources_polled,
   candidate_count:receipt.news_candidate_count,
   news_candidates:receipt.news_candidates,
   website_intelligence_enabled:false,website_intelligence_writes:0,
   raw_publisher_content_saved:false,commercial_rights_verified:false,
   customer_delivery_enabled:false,signed_gro_generated:false
 },null,2)+"\n",{mode:0o600});
 writeFileSync(dir+"/official-references.json",JSON.stringify({
   schema:receipt.official_reference_source_checks.length===9?
     "geomacro.corridor-official-reference-intake.v1":null,
   channel:"CORRIDOR_ONLY",checked_at:receipt.checked_at,
   source_checks:receipt.official_reference_source_checks,
   observation_count:receipt.official_reference_observation_count,
   observations:receipt.official_reference_observations,
   website_intelligence_enabled:false,website_intelligence_writes:0,
   commercial_rights_verified:false,paid_output_authorized:false
 },null,2)+"\n",{mode:0o600});
 writeFileSync(dir+"/structured-research.json",JSON.stringify(structured,null,2)+"\n",
   {mode:0o600});
 const summary={
   schema:receipt.schema,channel:receipt.channel,checked_at:receipt.checked_at,
   source_count:receipt.source_count,source_link_occurrences:receipt.source_link_occurrences,
   unique_linked_sources:receipt.unique_linked_sources,
   native_news_sources_polled:receipt.native_news_sources_polled,
   news_candidate_count:receipt.news_candidate_count,
   official_reference_observations:receipt.official_reference_observation_count,
   private_structured_research_records:structured.structured_record_count,
   official_reference_sources_due:receipt.official_reference_source_checks.filter(x=>x.state!=="NOT_DUE_SOURCE_NATIVE_CADENCE").length,
   candidate_corridor_count:receipt.candidate_corridors.length,
   portal_or_metadata_sources_observed:receipt.source_checks.filter(x=>
     x.metadata_candidates>0||["PORTAL_TRANSPORT_OBSERVED_NO_EVENT",
       "RECENT_INDEX_CONTEXT_OBSERVED","OFFICIAL_PERIODIC_REPORT_INDEX_OBSERVED"].includes(x.state)).length,
   provider_auth_required:receipt.source_checks.filter(x=>x.state==="PROVIDER_API_AUTH_REQUIRED").length,
   website_writes:0,canonical_corridor_writes:0,
   signed_gro_generated:false,commercial_eligible:false
 };
 console.log(JSON.stringify(summary));
 return summary;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 await runDirectCorridorIntake().catch(error=>{
   // No upstream content or credential logging.
   console.error("DIRECT_CORRIDOR_READER_FAILURE",String(error?.message??"UNKNOWN").slice(0,100));
   process.exitCode=2;
 });
}
