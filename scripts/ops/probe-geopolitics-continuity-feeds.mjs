/** Read-only 15-source geopolitics alternate health: no writes, no
 * title/body/URL publication, no account or publisher anti-bot bypass.
 * Output is an operator candidate/transport receipt, NOT native-page proof.
 */
import {writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {geopoliticsContinuitySources} from "../lib/geopolitics-continuity-sources.mjs";
import {collectPrivateOsint15m} from "../lib/private-osint-15m-collector.mjs";
import {privateOsintCountryMention} from "../lib/private-osint-country-mentions.mjs";
import {normalizeReusableNewsJson} from "../../src/lib/reusable-news-json.ts";
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195.ts";

const registry=geopoliticsContinuitySources();
const results=Array(registry.length);
let next=0;
async function worker(){
 while(next<registry.length){
  const i=next++,s=registry[i];
  let state="NETWORK_ERROR",http_status=null,xml_like=false;
  try{
   const response=await fetch(s.url,{
    method:"GET",redirect:"manual",signal:AbortSignal.timeout(8000),
    headers:{"Accept":"application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9",
      "User-Agent":"GeomacroOSINT/1.0 (+https://geomacro.live)"}
   });
   http_status=response.status;
   if(response.status!==200){
    state=[401,403,429].includes(response.status)?"DENIED_OR_RATE_LIMITED":
      [301,302,303,307,308].includes(response.status)?"REDIRECT_NEEDS_CANONICAL_CHECK":"HTTP_NON_200";
   } else {
    const reader=response.body?.getReader();
    const chunk=reader?await reader.read():{value:new Uint8Array()};
    const sample=new TextDecoder().decode((chunk.value??new Uint8Array()).slice(0,8192));
    xml_like=/<(?:rss|feed|rdf:RDF)(?:\s|>)/iu.test(sample);
    state=xml_like?"HTTP_200_XML_CANDIDATE":"HTTP_200_NOT_XML";
    try{await reader?.cancel()}catch{}
   }
  }catch(error){state=error?.name==="TimeoutError"?"TIMEOUT":"NETWORK_ERROR"}
  results[i]={source_id:s.id,state,http_status,xml_like,original_article_verified:false};
 }
}
await Promise.all(Array.from({length:4},worker));
const native=await collectPrivateOsint15m({
 now:new Date(),registry,normalize:normalizeReusableNewsJson,
 resolveCountry:title=>privateOsintCountryMention(title,COUNTRIES_195),
 concurrency:4,
});
const nativeByRef=new Map(native.checks.map(c=>[c.source_ref,c.state]));
const checks=registry.map(s=>({
 source_id:s.id,
 native_category_state:nativeByRef.get(createHash("sha256").update(
   [s.id,s.url,"geopolitics"].join("\n")).digest("hex"))??"NOT_CHECKED",
}));
const report={
 schema:"geomacro.geopolitics-continuity-readonly-probe.v1",
 checked_at:new Date().toISOString(),sources_configured:registry.length,
 transport_xml_200_candidates:results.filter(r=>r.state==="HTTP_200_XML_CANDIDATE").length,
 transport_failed_or_unverified:results.filter(r=>r.state!=="HTTP_200_XML_CANDIDATE").length,
 factual_geopolitics_items_25h:native.summary.selected_items_by_category?.geopolitics??0,
 collector_source_states:native.summary.source_states,
 checks,results,
 original_article_pages_verified:0,items_d1_written:0,items_b2_written:0,
 provider_rights_verified:false,commercial_eligible:false,
};
writeFileSync("/tmp/geomacro-geopolitics-continuity-readonly.json",
 JSON.stringify(report,null,2),{mode:0o600});
console.log(JSON.stringify(report));
