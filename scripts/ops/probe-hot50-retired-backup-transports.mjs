import {writeFileSync} from "node:fs";
import {hot50RetiredBackupSources} from "../lib/hot-50-retired-backup-sources.mjs";
const {registry,replacements}=hot50RetiredBackupSources();
const maxConcurrency=4;
const results=Array(registry.length);
let next=0;
async function worker(){
 while(next<registry.length){
  const i=next++,s=registry[i];
  let state="NETWORK_ERROR",http_status=null,xml_like=false;
  try{
   const response=await fetch(s.url,{
    method:"GET",redirect:"follow",signal:AbortSignal.timeout(8000),
    headers:{"Accept":"application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9",
     "User-Agent":"GeomacroOSINT/1.0 (+https://geomacro.live)"}
   });
   http_status=response.status;
   if(response.status!==200)state=response.status===403||response.status===429?"DENIED_OR_RATE_LIMITED":"HTTP_NON_200";
   else{
    const reader=response.body?.getReader();
    const chunk=reader?await reader.read():{value:new Uint8Array()};
    const sample=new TextDecoder().decode((chunk.value??new Uint8Array()).slice(0,8192));
    xml_like=/<(?:rss(?:\\s|>)|feed(?:\\s|>)|rdf:RDF(?:\\s|>))/iu.test(sample);
    state=xml_like?"HTTP_200_XML_CANDIDATE":"HTTP_200_NOT_XML";
    try{await reader?.cancel()}catch{}
   }
  }catch(error){state=error?.name==="TimeoutError"?"TIMEOUT":"NETWORK_ERROR"}
  results[i]={source_id:s.id,backup_for_retired_ids:s.backup_for_retired_ids,
   state,http_status,xml_like,origin_native_date_not_verified:true};
 }
}
await Promise.all(Array.from({length:maxConcurrency},worker));
const report={schema:"geomacro.hot50.backup-readonly-transport-probe.v1",
 checked_at:new Date().toISOString(),backup_mappings:replacements.length,
 distinct_urls_polled:registry.length,
 http_200_xml_candidates:results.filter(x=>x.state==="HTTP_200_XML_CANDIDATE").length,
 failed_or_unverified:results.filter(x=>x.state!=="HTTP_200_XML_CANDIDATE").length,
 native_published_time_independently_verified:false,
 items_d1_written:0,items_b2_written:0,
 results};
writeFileSync("/tmp/geomacro-hot50-backup-live-probe.json",
 JSON.stringify(report,null,2)+"\\n",{mode:0o600});
console.log(JSON.stringify(report));
