#!/usr/bin/env node
/**
 * IRONSIGHT-compatible OFFICIAL ORIGINAL ISSUER source discovery.
 *
 * IRONSIGHT itself is a research-only dashboard; its unofficial Telegram
 * embed scraping, Google/Yahoo proxy reads and copied media RSS feeds are
 * NOT imported, hosted, or authorized for Geomacro's commercial pipeline.
 *
 * Only the two independently published U.S. government issuer RSS locations
 * explicitly listed in the upstream IRONSIGHT configuration are probed.
 * No publisher permission, current event, geographic attribution, source
 * rights, or signed product is inferred from mere feed accessibility.
 *
 * Source reference: https://github.com/NoblerWorks-HQ/IRONSIGHT
 * IRONSIGHT repository MIT copyright (c) 2026 Nobler Works. This adapter
 * is independently implemented and copies no IRONSIGHT parser source.
 */
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";

export const IRONSIGHT_OFFICIAL_DISCOVERY_SOURCES=Object.freeze([
 Object.freeze({
  id:"IRONSIGHT_CENTCOM_OFFICIAL_ISSUER",
  url:"https://www.centcom.mil/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=808&max=20",
  issuer:"US_CENTCOM",category:"geopolitics",upstream_code_source:"NoblerWorks-HQ/IRONSIGHT",
 }),
 Object.freeze({
  id:"IRONSIGHT_DOD_OFFICIAL_ISSUER",
  url:"https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=945&max=10",
  issuer:"US_DOD",category:"geopolitics",upstream_code_source:"NoblerWorks-HQ/IRONSIGHT",
 }),
]);
const MAX_BYTES=192_000;
const MIME=new Set(["application/rss+xml","application/xml","text/xml","application/atom+xml"]);
const XML_DTD=/<!DOCTYPE|<!ENTITY/iu;
const safeLength=(res)=>Number(res.headers.get("content-length")||0);
async function boundedXml(res){
 if(safeLength(res)>MAX_BYTES)throw Error("SIZE_LIMIT");
 const reader=res.body?.getReader();
 if(!reader)throw Error("NO_BODY");
 let text="",count=0;
 const decoder=new TextDecoder("utf-8",{fatal:true});
 try{
  for(;;){
   const {done,value}=await reader.read();
   if(done)break;
   count+=value.byteLength;
   if(count>MAX_BYTES)throw Error("SIZE_LIMIT");
   text+=decoder.decode(value,{stream:true});
  }
  text+=decoder.decode();
  return text;
 }finally{await reader.cancel().catch(()=>undefined)}
}
/**
 * Only deterministic transport/schema observations. No untrusted upstream
 * string, user-defined URL, HTML/article byte, post text or secret in output.
 * The caller cannot add arbitrary domains or redirect to a different host.
 */
export async function probeIronsightOfficialSources({
 fetchImpl=fetch,timeout=7000,now=Date.now(),
}={}){
 if(!Number.isSafeInteger(timeout)||timeout<500||timeout>15000||
   !Number.isFinite(now))throw Error("IRONSIGHT_DIAGNOSTIC_BUDGET_INVALID");
 const rows=[];
 for(const src of IRONSIGHT_OFFICIAL_DISCOVERY_SOURCES){
  const row={id:src.id,issuer:src.issuer,category:src.category,
   http_status:null,transport_state:"NOT_CHECKED",xml_envelope_verified:false,
   native_date_present:false,raw_items_returned:false,
   original_article_identity_verified:false,commercial_derived_rights_verified:false,
   independent_event_verified:false,telegram_platform_authorization_verified:false,
   production_ingest_enabled:false};
  try{
   const res=await fetchImpl(src.url,{
    method:"GET",redirect:"manual",cache:"no-store",
    headers:{Accept:"application/rss+xml, application/atom+xml, application/xml, text/xml"},
    signal:AbortSignal.timeout(timeout),
   });
   row.http_status=res.status;
   if(res.status!==200){
    row.transport_state=res.status===429?"RATE_LIMITED_NO_RETRY":
      res.status===403?"PUBLISHER_FORBIDDEN_NO_BYPASS":
      res.status>=300&&res.status<400?"REDIRECT_NOT_FOLLOWED":
      "NON_200";
    await res.body?.cancel().catch(()=>undefined);rows.push(row);continue;
   }
   const mime=(res.headers.get("content-type")||"").split(";")[0].trim().toLowerCase();
   if(!MIME.has(mime)){
    row.transport_state="NOT_XML_MEDIA_TYPE";
    await res.body?.cancel().catch(()=>undefined);rows.push(row);continue;
   }
   const xml=await boundedXml(res);
   if(XML_DTD.test(xml)||
       !(/<rss(?:\s|>)/iu.test(xml) && /<item(?:\s|>)/iu.test(xml)) &&
         !(/<feed(?:\s|>)/iu.test(xml) && /<entry(?:\s|>)/iu.test(xml)))){
    row.transport_state="UNQUALIFIED_XML_ENVELOPE";
    rows.push(row);continue;
   }
   row.xml_envelope_verified=true;
   row.native_date_present=/<(?:pubDate|published)(?:\s[^>]*)?>[^<]{10,80}<\/(?:pubDate|published)>/iu.test(xml);
   // A feed's <updated>, request time or cache time are NEVER an
   // original publication timestamp. Never return the original XML.
   row.transport_state="OFFICIAL_FEED_TRANSPORT_OBSERVED_RESEARCH_ONLY";
  }catch{
   row.transport_state="NETWORK_OR_BOUND_EXCEEDED";
  }
  rows.push(row);
 }
 return Object.freeze({
  schema:"geomacro.ironsight-official-issuer-research-probe.v1",
  upstream_project:"NoblerWorks-HQ/IRONSIGHT",
  upstream_software_license:"MIT",
  upstream_project_data_scope:"NON_COMMERCIAL_RESEARCH_VIEWER",
  only_independent_original_government_issuers:true,
  source_count:rows.length,category_scope:["geopolitics"],
  original_news_verified:false,
  issuer_identity_and_content_rights_separately_required:true,
  commercial_use_granted:false,
  telegram_scraping_enabled:false,
  telegram_session_used:false,
  google_translate_unofficial_used:false,
  payment_attempted:false,storage_mutated:false,
  qualifying_paid_intelligence:false,
  checked_at:new Date(now).toISOString(),
  rows,
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{console.log(JSON.stringify(await probeIronsightOfficialSources()));}
 catch{console.error("IRONSIGHT_OFFICIAL_DISCOVERY_FAIL_CLOSED");process.exitCode=2;}
}
