#!/usr/bin/env node
// Weekly bounded public terms observation for the EXISTING reviewed dataset
// catalogue only. GETs do not confer any new source rights. Status and content
// digests are informational, NOT article-specific legal grants.
import {createHash} from "node:crypto";
import {COMMERCIAL_SOURCE_RIGHTS_EVIDENCE} from "../commercial-source-rights-evidence.mjs";
const urls=[...new Set(Object.values(COMMERCIAL_SOURCE_RIGHTS_EVIDENCE)
  .map(x=>x.terms_url).filter(Boolean))].sort();
const MAX_BYTES=128*1024;
const sha=b=>createHash("sha256").update(b).digest("hex");
export async function probeOfficialCommercialTerms(fetchImpl=fetch){
 const results=[];
 for(const url of urls.slice(0,16)){
  // URLs can only come from the pinned versioned source-rights catalogue.
  const u=new URL(url);
  if(u.protocol!=="https:"||u.username||u.password||u.hash){
   results.push({state:"PINNED_URL_INVALID"});continue;
  }
  try{
   const res=await fetchImpl(url,{method:"GET",redirect:"manual",
    headers:{accept:"text/html, text/plain, application/json;q=0.7"},
    signal:AbortSignal.timeout(11000)});
   if(res.status!==200){results.push({state:"HTTP_UNVERIFIED",status:res.status});continue;}
   // No redirect to an unapproved domain, no oversized page, no body logging.
   if(res.url!==url){results.push({state:"ENDPOINT_CHANGED"});continue;}
   const reader=res.body?.getReader();if(!reader){
    results.push({state:"BODY_UNAVAILABLE"});continue;
   }
   let size=0,chunks=[];
   for(;;){
    const p=await reader.read();if(p.done)break;
    size+=p.value.byteLength;
    if(size>MAX_BYTES){await reader.cancel().catch(()=>{});
      chunks=[];break;}
    chunks.push(p.value);
   }
   if(!chunks.length){results.push({state:"BODY_EMPTY_OR_OVERSIZED"});continue;}
   const bytes=Buffer.concat(chunks.map(x=>Buffer.from(x)));
   results.push({state:"PUBLIC_TERMS_BYTES_OBSERVED",
    bytes:bytes.length,sha256:sha(bytes)});
  }catch{results.push({state:"FETCH_UNAVAILABLE"});}
 }
 const summary={};
 for(const r of results)summary[r.state]=(summary[r.state]||0)+1;
 return Object.freeze({
   schema:"geomacro.rights-public-terms-observation.v1",
   catalogue_evidence_entries:Object.keys(COMMERCIAL_SOURCE_RIGHTS_EVIDENCE).length,
   pinned_terms_urls:urls.length,public_https_gets_attempted:results.length,
   outcomes:summary,
   // A new license, right or permission cannot be manufactured by GETting
   // an official terms page; owner policy and legal authority remain separate.
   article_specific_rights_newly_approved:0,
   source_rights_automatically_created:false,
   source_terms_scope_legally_verified:false,
   rights_authority_signed:false,
   sources_activated_for_paid_products:0,
   paid_gro_issued:0,payments:0,supabase_requests:0,b2_requests:0,d1_writes:0,
 });
}
if(process.argv[1]?.endsWith("observe-commercial-license-terms.mjs")){
 probeOfficialCommercialTerms().then(v=>console.log(JSON.stringify(v)))
 .catch(()=>{console.error("RIGHTS_TERMS_OBSERVATION_FAILED_CLOSED");process.exitCode=2});
}
