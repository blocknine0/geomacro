#!/usr/bin/env node
/**
 * Read-only weekly re-evaluation of ALL source terms already in the
 * Geomacro commercial source evidence register. No automatic legal approval:
 * successful HTTP does NOT prove commercial usage rights for a single page.
 */
import {createHash} from "node:crypto";
import {mkdirSync,writeFileSync} from "node:fs";
import {buildCommercialRightsRemediationInventory} from "../lib/commercial-rights-remediation.mjs";
const MAX_BODY=192*1024;
const MAX_TIME=13000;
const OUT="artifacts/source-rights/current-source-terms-audit.json";
const ALLOWED_HOSTS=new Set([
 "datacatalog.worldbank.org","www.worldbank.org","www.unhcr.org","gdeltproject.org",
 "ucdp.uu.se","www.usgs.gov","www.gdeltproject.org","ec.europa.eu",
 "reliefweb.int","api.reliefweb.int","www.reliefweb.int"
]);
const sha=b=>createHash("sha256").update(b).digest("hex");
const invalid=()=>{throw Error("SOURCE_RIGHTS_TERMS_AUDIT_INVALID")};
export async function inspectKnownRightsTerms(row,fetchImpl=fetch){
 if(!row?.source_id||!row?.terms_url||!row?.dataset_url)invalid();
 let url;
 try{url=new URL(row.terms_url)}catch{invalid()}
 if(url.protocol!=="https:"||url.username||url.password||url.port||
    !ALLOWED_HOSTS.has(url.hostname))invalid();
 let response;
 try{
  response=await fetchImpl(url.href,{
   method:"GET",redirect:"manual",cache:"no-store",
   headers:{"accept":"text/html, text/plain, application/pdf;q=0.6"},
   signal:AbortSignal.timeout(MAX_TIME)
  });
 }catch{return {source_id:row.source_id,status:"TERMS_FETCH_UNAVAILABLE",terms_sha256:null}}
 const media=(response.headers?.get("content-type")??"").toLowerCase();
 if(!response.ok||response.status!==200)
  return {source_id:row.source_id,status:response.status>=300&&response.status<400?
   "TERMS_REDIRECT_REVIEW_REQUIRED":"TERMS_HTTP_REVIEW_REQUIRED",http_status:response.status,terms_sha256:null};
 if(!/^(text\/html|text\/plain|application\/pdf)/.test(media))
  return {source_id:row.source_id,status:"TERMS_CONTENT_TYPE_UNEXPECTED",terms_sha256:null};
 const reader=response.body?.getReader();if(!reader)
  return {source_id:row.source_id,status:"TERMS_BODY_UNAVAILABLE",terms_sha256:null};
 const parts=[];let length=0;
 try{
  for(;;){
   const next=await reader.read();if(next.done)break;
   length+=next.value.byteLength;
   if(length>MAX_BODY){await reader.cancel().catch(()=>{});return {
    source_id:row.source_id,status:"TERMS_TOO_LARGE_FOR_FREE_AUDIT",terms_sha256:null
   }}
   parts.push(Buffer.from(next.value));
  }
 }catch{return {source_id:row.source_id,status:"TERMS_BODY_UNAVAILABLE",terms_sha256:null}}
 const bytes=Buffer.concat(parts);
 return {source_id:row.source_id,status:"TERMS_BYTES_RETRIEVED_FOR_REVIEW",
  terms_sha256:sha(bytes),terms_bytes:bytes.length,
  article_specific_permission_certified:false};
}
export async function runSourceRightsTermsAudit(fetchImpl=fetch){
 const inventory=buildCommercialRightsRemediationInventory();
 const rows=[];
 for(let index=0;index<inventory.rows.length;index+=3){
  rows.push(...await Promise.all(inventory.rows.slice(index,index+3)
    .map(row=>inspectKnownRightsTerms(row,fetchImpl))));
 }
 const summary=Object.fromEntries([...new Set(rows.map(x=>x.status))].sort()
  .map(state=>[state,rows.filter(x=>x.status===state).length]));
 return {
  schema:"geomacro.source-rights-terms-monitor.v1",
  checked_at:new Date().toISOString(),
  sources_examined:inventory.rows.length,
  sources_with_terms_bytes_retrieved:summary.TERMS_BYTES_RETRIEVED_FOR_REVIEW??0,
  source_terms_availability:summary,
  rights_status_automatically_upgraded:false,
  no_attribution_permission_automatically_issued:false,
  article_scope_verified:false,third_party_exclusions_verified:false,
  rights_issuer_signatures:0,gro_signatures:0,
  b2_requests:0,d1_writes:0,supabase_requests:0,payments:0,
  rows
 };
}
if(process.argv[1]?.endsWith("monitor-commercial-source-rights.mjs")){
 runSourceRightsTermsAudit().then(report=>{
  mkdirSync("artifacts/source-rights",{recursive:true});
  writeFileSync(OUT,JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify({
   schema:report.schema,sources_examined:report.sources_examined,
   terms_retrieved:report.sources_with_terms_bytes_retrieved,
   state_counts:report.source_terms_availability,
   rights_upgrades:0,signatures:0,charges:0,artifact:OUT
  }));
 }).catch(()=>{
  console.error("SOURCE_RIGHTS_TERMS_AUDIT_UNAVAILABLE");
  process.exitCode=1;
 });
}
