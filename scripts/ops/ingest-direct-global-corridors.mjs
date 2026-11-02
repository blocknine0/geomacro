#!/usr/bin/env node
/** Independent corridor-only source receipt. No website publisher imported. */
import {mkdirSync,writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {collectDirectCorridorSourceIntake} from "../lib/direct-global-corridor-ingestion.mjs";
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
 const dir="artifacts/direct-corridor-intake";
 mkdirSync(dir,{recursive:true,mode:0o700});
 writeFileSync(dir+"/receipt.json",JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
 const summary={
   schema:receipt.schema,channel:receipt.channel,checked_at:receipt.checked_at,
   source_count:receipt.source_count,source_link_occurrences:receipt.source_link_occurrences,
   unique_linked_sources:receipt.unique_linked_sources,candidate_corridor_count:receipt.candidate_corridors.length,
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
