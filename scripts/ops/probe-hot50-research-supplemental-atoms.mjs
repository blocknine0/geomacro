#!/usr/bin/env node
/** No-funds, read-only, first-party GOV.UK Atom transport/format admission.
 * Transport PASS must never imply current original evidence, publisher
 * expression rights, independent corroboration, paid delivery or signed GRO.
 */
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {dirname} from "node:path";
const PATH=new URL("../../config/research-hot50-supplemental-govuk-atoms.v1.json",import.meta.url);
const IDS=new Set(["uk_ofsi_ogl_official_atom","uk_otsi_ogl_official_atom",
 "uk_ukef_ogl_macro_atom","uk_ukri_ogl_minerals_atom"]);
export function inspectResearchSupplementalRegistry(doc){
 if(doc?.schema!=="geomacro.hot50.research-supplemental-govuk-atom.v1"||
    doc.scope!=="HOT50_NONCOMMERCIAL_RESEARCH_ONLY"||
    doc.historical_global_source_registry_unchanged!==true||
    doc.commercial_risk_gate_eligible!==false||
    !Array.isArray(doc.sources)||doc.sources.length!==IDS.size)
  throw Error("HOT50_RESEARCH_SUPPLEMENTAL_REGISTRY_INVALID");
 const seen=new Set();
 for(const row of doc.sources){
  const url=new URL(row.feed_url);
  if(!IDS.has(row.source_id)||seen.has(row.source_id)||
     row.owner_country_iso3!=="GBR"||
     row.private_research_only!==true||
     row.commercial_promotion_requires_separate_main_gates!==true||
     row.telegram_content_license!==false||
     row.ingest_transport!=="DIRECT_OFFICIAL_ATOM"||
     url.hostname!=="www.gov.uk"||url.protocol!=="https:"||
     url.username||url.password||url.port||url.search||url.hash||
     !/^\/government\/organisations\/[a-z-]+\.atom$/u.test(url.pathname))
   throw Error("HOT50_RESEARCH_SUPPLEMENTAL_SOURCE_UNPINNED");
  seen.add(row.source_id);
 }
 return doc.sources;
}
export async function probeResearchSupplements({
 fetchImpl=fetch,doc=JSON.parse(readFileSync(PATH,"utf8")),now=Date.now()
}={}){
 const rows=inspectResearchSupplementalRegistry(doc);
 const results=[];
 for(const row of rows){
  const item={source_id:row.source_id,publisher_country:"GBR",
   category:row.category,transport:"UNKNOWN",http_status:null,
   atom_valid:false,entry_count:0,native_date_verified:false,
   original_page_verified:false,rights_verified:false,paid_eligible:false};
  try{
   const r=await fetchImpl(row.feed_url,{
    method:"GET",redirect:"error",cache:"no-store",
    headers:{Accept:"application/atom+xml,application/xml;q=0.9"},
    signal:AbortSignal.timeout(9000)});
   item.http_status=r.status;
   const len=Number(r.headers.get("content-length")||0);
   if(r.status!==200||r.redirected||len>320*1024)throw Error("HTTP_OR_SIZE");
   const body=await r.text();
   if(body.length>320*1024||/<!DOCTYPE|<!ENTITY/iu.test(body)||
      !/<feed(?:\s|>)/iu.test(body)||!/<\/feed\s*>/iu.test(body))
    throw Error("ATOM_FORMAT");
   item.atom_valid=true;
   item.entry_count=[...body.matchAll(/<entry(?:\s[^>]*)?>/giu)].length;
   item.transport="ATOM_VALID";
   item.native_date_verified=[...body.matchAll(/<published>([^<]+)<\/published>/giu)]
    .slice(0,40).some(m=>{
     const t=Date.parse(m[1]);return Number.isFinite(t)&&t<=now&&t>now-72*3600000;
    });
  }catch{
   item.transport="NOT_VERIFIED";
  }
  results.push(item);
 }
 return {schema:"geomacro.hot50.research-supplemental-atom-probe.v1",
  source_count:results.length,transport_valid:results.filter(x=>x.atom_valid).length,
  all_transport_valid:results.every(x=>x.atom_valid),native_originals_inferred:false,
  independent_event_verified:false,commercial_rights_verified:false,
  signed_gro_verified:false,paid_delivery_authorized:false,results};
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href){
 const report=await probeResearchSupplements();
 if(process.env.GITHUB_WORKSPACE){
  const path=process.env.RUNNER_TEMP?process.env.RUNNER_TEMP+"/hot50-research-supplemental-probe.json":"/tmp/hot50-research-supplemental-probe.json";
  mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(report,null,2)+"\n",{mode:0o600});
 }
 console.log(JSON.stringify(report));
 if(!report.all_transport_valid)process.exitCode=1;
}
