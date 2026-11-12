#!/usr/bin/env node
/**
 * Live P0 schema/transport certification.
 * Read-only. Never enables a source or persists publisher prose.
 */
import fs from "node:fs/promises";
import { parseMofcomExportControlHtml } from "../global-intelligence/adapters/china-mofcom.mjs";
import { parseAustraliaCriticalMineralsHtml } from "../global-intelligence/adapters/australia-critical-minerals.mjs";
import { parseCochilcoAnuarioHtml } from "../global-intelligence/adapters/cochilco-minerals.mjs";
import { parseOpcwNewsHtml } from "../global-intelligence/adapters/opcw-news.mjs";
import { parseIcjCasesHtml } from "../global-intelligence/adapters/icj-cases.mjs";
import { discoverIccArticleUrls,parseIccArticleHtml } from "../global-intelligence/adapters/icc-news.mjs";
import { parseUnctadPublisherReleaseCalendarHtml } from "../global-intelligence/adapters/unctadstat.mjs";
import { parseWorldBankPinkSheetReleaseMetadata } from "../global-intelligence/adapters/world-bank-commodity-prices.mjs";

const registry = JSON.parse(await fs.readFile(new URL("../config/global-p0-source-expansion.json", import.meta.url), "utf8"));
const timeoutMs = Number(process.env.P0_SOURCE_LIVE_TIMEOUT_MS ?? 20000);
const checks = {
  uk_sanctions_list: { type:"xml", required:["UniqueID","PrimaryName"] },
  eu_sanctions_consolidated: { type:"any-structured", required:[] },
  world_bank_commodity_prices: { type:"xlsx", required:[] },
  unctadstat_global: { type:"html", required:["UNCTAD"] },
  china_mofcom_trade_controls: { type:"html", required:["exportcontrol.mofcom.gov.cn"] },
  australia_critical_minerals: { type:"html", required:["Critical Minerals List","Strategic Materials List"] },
  cochilco_minerals: { type:"html", required:["Anuario de Estadísticas del Cobre y Otros Minerales"] },
  opcw_news: { type:"html", required:["News","OPCW"] },
  icj_cases: { type:"html", required:["Cases","International Court of Justice"] },
  icc_news: { type:"html", required:["International Criminal Court"] }
};
const runtimeExtractors = {
  china_mofcom_trade_controls: (text, retrievedAt) => parseMofcomExportControlHtml(text, { observedAt:retrievedAt }).length,
  australia_critical_minerals: (text, retrievedAt) => parseAustraliaCriticalMineralsHtml(text, { retrievedAt }).length,
  cochilco_minerals: (text, retrievedAt) => parseCochilcoAnuarioHtml(text, { retrievedAt }).value_numeric,
  opcw_news: (text, retrievedAt) => parseOpcwNewsHtml(text, { retrievedAt }).length,
  icj_cases: (text, retrievedAt) => parseIcjCasesHtml(text, { retrievedAt }).length
};
function structured(type,bytes,text,ct,url){
 const lower=ct.toLowerCase();
 if(type==="xml")return /xml/i.test(lower)||/\.xml(?:$|[?#])/i.test(url)?/^\s*</.test(text):false;
 if(type==="xlsx")return bytes.length>100&&bytes[0]===0x50&&bytes[1]===0x4b;
 if(type==="any-structured")return /xml|csv|json|spreadsheet|excel|officedocument/i.test(lower)||/(?:\.xml|\.csv|\.json)(?:$|[?#])/i.test(url);
 if(type==="html")return /html/i.test(lower)&&/<html|<body|<script|<!doctype/i.test(text);
 return false;
}
function safeFailure(error,prefix){
 const e=error instanceof Error?error.message:"UNCLASSIFIED";
 return new RegExp("^"+prefix+"_[A-Z0-9_]+$","u").test(e)?e:
  (error?.name==="TimeoutError"?"UPSTREAM_TIMEOUT":
   (error?.name==="TypeError"?"UPSTREAM_NETWORK_ERROR":"SOURCE_SCHEMA_INVALID"));
}
async function get(url,accept="*/*"){
 return fetch(url,{redirect:"follow",signal:AbortSignal.timeout(timeoutMs),
  headers:{"user-agent":"Geomacro-P0-Live-Certification/1.0",accept}});
}
async function run(id,source){
 const url=id==="icc_news"?source.discovery_url:(source.machine_endpoint??source.dataset_surface??source.discovery_url);
 const started=Date.now(),observedAt=new Date().toISOString();
 const result={source_id:id,status:null,ok:false,schema_pass:false,content_type:null,bytes:0,
  final_url:null,extraction_count:null,extraction_error:null,runtime_pass:false,
  native_publication_time_verified:false,publisher_release_at_utc:null,latency_ms:0,
  observed_at:observedAt,note:null};
 try{
  const res=await get(url,id==="unctadstat_global"?"text/html":id==="icc_news"?"text/html":"*/*");
  const bytes=new Uint8Array(await res.arrayBuffer()),ct=res.headers.get("content-type")??"";
  const text=/xml|csv|json|html|text/i.test(ct)?new TextDecoder().decode(bytes):"";
  Object.assign(result,{status:res.status,ok:res.ok,content_type:ct,bytes:bytes.length,final_url:res.url});
  const rule=checks[id],requiredPass=(rule.required??[]).every(marker=>text.includes(marker));
  let schemaPass=false;
  if(res.ok&&id==="icc_news"){
   if(!/html/iu.test(ct))throw Error("ICC_NEWS_LISTING_MIME_INVALID");
   const links=discoverIccArticleUrls(text,{limit:1});
   if(!links.length)throw Error("ICC_NEWS_LISTING_PARSE_FAILED");
   const article=await get(links[0],"text/html");
   if(!article.ok||new URL(article.url).hostname!=="www.icc-cpi.int")throw Error("ICC_ARTICLE_HTTP_"+article.status);
   const articleType=article.headers.get("content-type")??"";
   if(!/html/iu.test(articleType))throw Error("ICC_ARTICLE_MIME_INVALID");
   const articleBytes=new Uint8Array(await article.arrayBuffer());
   if(articleBytes.length>2*1024*1024)throw Error("ICC_ARTICLE_TOO_LARGE");
   const parsed=parseIccArticleHtml(new TextDecoder().decode(articleBytes),{url:article.url,retrievedAt:observedAt});
   result.extraction_count=1;result.native_publication_time_verified=parsed.published_at!==null;
   result.publisher_release_at_utc=parsed.published_at;
   schemaPass=parsed.published_at!==null&&requiredPass;
  }else if(res.ok&&id==="unctadstat_global"){
   if(!/html/iu.test(ct))throw Error("UNCTAD_RELEASE_CALENDAR_MIME_INVALID");
   const clock=parseUnctadPublisherReleaseCalendarHtml(text);
   result.extraction_count=1;result.native_publication_time_verified=true;
   result.publisher_release_at_utc=clock.published_at;
   schemaPass=requiredPass;
  }else if(res.ok&&id==="world_bank_commodity_prices"){
   if(!structured(rule.type,bytes,text,ct,res.url))throw Error("WORLD_BANK_XLSX_SCHEMA_INVALID");
   const metaUrl=source.publisher_metadata_endpoint;
   if(!metaUrl)throw Error("WORLD_BANK_PUBLISHER_METADATA_ENDPOINT_NOT_CONFIGURED");
   const meta=await get(metaUrl,"text/html");
   if(!meta.ok||new URL(meta.url).hostname!=="www.worldbank.org")throw Error("WORLD_BANK_PUBLISHER_METADATA_HTTP_"+meta.status);
   const metaType=meta.headers.get("content-type")??"";
   if(!/html/iu.test(metaType))throw Error("WORLD_BANK_PUBLISHER_METADATA_MIME_INVALID");
   const metaBytes=new Uint8Array(await meta.arrayBuffer());
   if(metaBytes.length>2*1024*1024)throw Error("WORLD_BANK_PUBLISHER_METADATA_TOO_LARGE");
   const clock=parseWorldBankPinkSheetReleaseMetadata(new TextDecoder().decode(metaBytes));
   result.extraction_count=1;result.native_publication_time_verified=true;
   result.publisher_release_at_utc=clock.published_at;
   schemaPass=true;
  }else if(res.ok){
   if(runtimeExtractors[id])result.extraction_count=runtimeExtractors[id](text,observedAt);
   result.runtime_pass=!runtimeExtractors[id]||(Number(result.extraction_count)>0);
   schemaPass=structured(rule.type,bytes,text,ct,res.url)&&requiredPass&&result.runtime_pass;
  }
  result.schema_pass=schemaPass;result.runtime_pass=schemaPass;
  result.note=schemaPass?"transport/schema/native-clock candidate passed":"transport or schema validation failed";
 }catch(error){
  result.extraction_error=safeFailure(error,id==="icc_news"?"ICC":id==="unctadstat_global"?"UNCTAD":id==="world_bank_commodity_prices"?"WORLD_BANK":"P0");
  result.schema_pass=false;result.runtime_pass=false;result.note=result.extraction_error;
 }
 result.latency_ms=Date.now()-started;
 return result;
}
const results=[];
for(const id of Object.keys(checks))results.push(await run(id,registry.p0_global_source_expansion.sources[id]));
const failed=results.filter(row=>!row.ok||!row.schema_pass);
const blockingFailures=failed.filter(row=>registry.p0_global_source_expansion.sources[row.source_id]?.enabled!==false);
console.log(JSON.stringify({mode:"READ_ONLY_LIVE_SCHEMA_CERTIFICATION",source_count:results.length,
 pass_count:results.length-failed.length,fail_count:failed.length,blocking_fail_count:blockingFailures.length,
 non_blocking_disabled_fail_count:failed.length-blockingFailures.length,results},null,2));
process.exitCode=blockingFailures.length?1:0;
