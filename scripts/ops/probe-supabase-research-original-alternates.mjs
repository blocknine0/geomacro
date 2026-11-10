#!/usr/bin/env node
/**
 * Public-read-only HTTP transport probe for FOUR proposed research Atom pins.
 * Does not ingest, score, certify, log upstream titles or write D1/B2/Supabase.
 * A 200 Atom root is transport readiness only, not event/native-page evidence.
 */
import {readFileSync,writeFileSync} from "node:fs";
const manifest=JSON.parse(readFileSync(new URL(
 "../../config/official-ogl-atom-sources.json",import.meta.url),"utf8"));
const pins=[
 "uk_ofsi_ogl_sanctions_atom","uk_otsi_ogl_sanctions_atom",
 "uk_ukef_ogl_macro_atom","uk_ukri_ogl_minerals_atom"
];
if(manifest?.schema!=="geomacro.official-free-atom-license-registry.v1")
 throw Error("RESEARCH_PROBE_REGISTRY_INVALID");
const report=[];
for(const id of pins){
 const rows=manifest.sources.filter(s=>s.source_id===id);
 if(rows.length!==1||rows[0].private_research_only!==true)
  throw Error("RESEARCH_PROBE_PIN_INVALID");
 const s=rows[0],u=new URL(s.feed_url);
 if(u.protocol!=="https:"||u.hostname!=="www.gov.uk"||u.search||u.hash||
    u.pathname!==new URL(s.publisher_page).pathname+".atom")
  throw Error("RESEARCH_PROBE_URL_UNSAFE");
 let state="NETWORK_OR_TIMEOUT",http_status=null;
 try{
  const r=await fetch(u.href,{method:"GET",redirect:"manual",
   signal:AbortSignal.timeout(8000),
   headers:{Accept:"application/atom+xml,application/xml;q=0.9",
    "User-Agent":"GeoMacro-Private-Official-Research/1.0"}});
  http_status=r.status;
  if(r.status===200){
   const mime=r.headers.get("content-type")?.toLowerCase()??"";
   if(!mime.includes("xml"))state="HTTP_200_NON_XML";
   else{
    const reader=r.body?.getReader();let sample="",size=0;
    try{
     while(reader&&size<12000){
      const {value,done}=await reader.read();if(done)break;
      size+=value.byteLength;
      sample+=new TextDecoder().decode(value.slice(0,Math.max(0,12000-(size-value.byteLength))));
     }
    }finally{try{await reader?.cancel()}catch{}}
    state=/<feed(?:\s|>)/iu.test(sample)?"HTTP_200_ATOM_ROOT":"HTTP_200_NON_ATOM";
   }
  }else if([301,302,303,307,308].includes(r.status))state="REDIRECT_UNVERIFIED";
  else if([401,403,429].includes(r.status))state="DENIED_OR_RATE_LIMITED";
  else state="HTTP_NON_200";
 }catch(error){state=error?.name==="TimeoutError"?"TIMEOUT":"NETWORK_ERROR"}
 report.push({source_id:id,category:s.category,transport_state:state,
  http_status,original_page_verified:false,commercial_eligible:false});
}
const result={schema:"geomacro.research-official-four-alternates-readonly.v1",
 checked_at:new Date().toISOString(),feeds_checked:4,
 successful_atom_transport:report.filter(x=>x.transport_state==="HTTP_200_ATOM_ROOT").length,
 results:report,database_writes:0,original_article_verified:false};
writeFileSync("/tmp/geomacro-research-source-probe.json",JSON.stringify(result,null,2),
 {mode:0o600});
console.log(JSON.stringify(result));
if(result.successful_atom_transport!==pins.length)process.exitCode=2;
