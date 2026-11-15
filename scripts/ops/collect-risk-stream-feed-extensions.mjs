#!/usr/bin/env node
import {readFileSync,writeFileSync} from "node:fs";
import {prepareRiskStreamCandidate} from "../lib/risk-stream-candidate-builder.mjs";
import {eventIdentityFields} from "../lib/risk-stream-event-fingerprint.mjs";

const fail=code=>{throw Error("RISK_STREAM_FEED_EXTENSION_"+code)};
const RIGHTS_PATH="config/risk-stream-source-rights-reviewed.v1.json";
const FEEDS_PATH="config/unified-rss-feed-registry.v1.json";
const MAX_FEED_BYTES=2_000_000;
const CATEGORY_BY_FEED={conflict:"GEOPOLITICS",macro_economics:"MACRO_FX",
 commodities:"CRITICAL_MINERALS"};
const CATEGORY_TERMS={
 GEOPOLITICS:[[/sanction|asset freeze|export control/iu,"sanctions_policy"],
  [/ceasefire|hostilities pause/iu,"ceasefire"],
  [/attack|missile|troops|military|conflict|war|gaza|ukraine/iu,"conflict_escalation"],
  [/tariff|trade restriction|trade disruption/iu,"trade_disruption"]],
 MACRO_FX:[[/interest rate|monetary policy|bank rate/iu,"central_bank_policy"],
  [/inflation|consumer prices/iu,"inflation_release"],
  [/currency|exchange rate|sterling|pound/iu,"fx_intervention"],
  [/trade|tariff|customs/iu,"trade_disruption"]],
 CRITICAL_MINERALS:[[/export ban|export control/iu,"critical_mineral_export_control"],
  [/production|mine output/iu,"critical_mineral_production"],
  [/mineral|lithium|cobalt|copper|rare earth|graphite/iu,"critical_mineral_supply"],
  [/trade|customs/iu,"trade_disruption"]]
};
const COUNTRY_TERMS={USA:["united states","u.s.","usa"],GBR:["united kingdom","britain","british","uk"],
 CHN:["china","chinese"],IND:["india","indian"],RUS:["russia","russian"],
 UKR:["ukraine","ukrainian"],ISR:["israel","israeli"],PSE:["palestine","palestinian","gaza"],
 IRN:["iran","iranian"],SAU:["saudi arabia","saudi"],ARE:["united arab emirates","uae"],
 AUS:["australia","australian"],CAN:["canada","canadian"],BRA:["brazil","brazilian"],
 ZAF:["south africa"],IDN:["indonesia","indonesian"],CHL:["chile","chilean"],PER:["peru","peruvian"]};
const SOURCE_COUNTRY={uk_fcdo_ogl_official_atom:"GBR",uk_obr_ogl_macro_atom:"GBR",
 uk_dbt_ogl_minerals_atom:"GBR",uk_hmt_ogl_official_atom:"GBR",uk_desnz_ogl_minerals_atom:"GBR",
 uk_mod_ogl_security_atom:"GBR",uk_cabinet_ogl_security_atom:"GBR",uk_bist_ogl_minerals_atom:"GBR"};
const stripMarkup=value=>String(value??"").replace(/<[^>]*>/gu," ").replace(/&(?:amp|lt|gt|quot|apos);/gu,x=>
 ({"&amp;":"&","&lt;":"<","&gt;":">","&quot;":"\"","&apos;":"'"})[x]??" ").replace(/\s+/gu," ").trim();
async function boundedText(response){
 const declared=response.headers?.get?.("content-length");
 if(declared&&Number(declared)>MAX_FEED_BYTES)fail("FEED_SIZE_INVALID");
 if(response.body?.getReader){
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{
   while(true){const {done,value}=await reader.read();if(done)break;
    size+=value.byteLength;if(size>MAX_FEED_BYTES){await reader.cancel();fail("FEED_SIZE_INVALID")}
    chunks.push(value);
   }
  }finally{reader.releaseLock()}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
  return new TextDecoder("utf-8",{fatal:true}).decode(bytes);
 }
 const text=await response.text();
 if(typeof text!=="string"||Buffer.byteLength(text,"utf8")>MAX_FEED_BYTES)fail("FEED_SIZE_INVALID");
 return text;
}
const xmlText=value=>String(value).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu,"$1")
 .replace(/&(?:amp|lt|gt|quot|apos);/gu,entity=>({"&amp;":"&","&lt;":"<","&gt;":">","&quot;":"\"","&apos;":"'"})[entity]);

/** Extract only an explicitly publisher-supplied GeoMacro candidate extension. */
export function extractRiskStreamFeedExtensions(xml){
 if(typeof xml!=="string"||xml.length>2_000_000)fail("FEED_SIZE_INVALID");
 const rows=[];
 const pattern=/<((?:[A-Za-z_][\w.-]*:)?geomacro_risk_stream_candidate)\b[^>]*>([\s\S]*?)<\/\1\s*>/giu;
 for(const match of xml.matchAll(pattern)){
  const raw=xmlText(match[2]).trim();
  let value;try{value=JSON.parse(raw)}catch{fail("JSON_INVALID")}
  if(!value||typeof value!=="object"||Array.isArray(value))fail("CANDIDATE_INVALID");
  rows.push(value);
 }
 return rows;
}

function standardEntries(xml){
 if(typeof xml==="string"&&/^[\s]*[\[{]/u.test(xml)){
  try{
   const value=JSON.parse(xml),items=Array.isArray(value)?value:value?.items??value?.entries??[];
   if(Array.isArray(items))return items.map(item=>({
    id:String(item?.id??item?.guid??""),link:String(item?.url??item?.external_url??item?.link??""),
    updated:String(item?.date_modified??item?.date_published??item?.updated??item?.published??""),
    title:stripMarkup(item?.title??""),summary:stripMarkup(item?.summary??item?.content_text??item?.description??""),
    rights_markers:[item?.rights,item?.license,item?.license_url,...(Array.isArray(item?.tags)?item.tags:[])].filter(Boolean).join(" ")
   }));
  }catch{return []}
 }
 const rows=[];
 for(const match of xml.matchAll(/<(?:[\w.-]+:)?entry\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?entry\s*>/giu)){
  const block=match[1],value=name=>{
   const rx=new RegExp(`<(?:(?:[\\w.-]+):)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[\\w.-]+):)?${name}\\s*>`,'iu');
   return stripMarkup(block.match(rx)?.[1]??"");
  };
  const links=[...block.matchAll(/<(?:(?:[\w.-]+):)?link\b([^>]*)\/?\s*>/giu)].map(m=>m[1]);
  const link=links.map(attrs=>({href:attrs.match(/\bhref=["']([^"']+)["']/iu)?.[1],
   rel:attrs.match(/\brel=["']([^"']+)["']/iu)?.[1]})).find(x=>x.href&&(!x.rel||x.rel==="alternate"));
  const licenseLinks=links.map(attrs=>({href:attrs.match(/\bhref=["']([^"']+)["']/iu)?.[1],
   rel:attrs.match(/\brel=["']([^"']+)["']/iu)?.[1]})).filter(x=>x.href&&x.rel==="license");
  rows.push({id:value("id")||link?.href,link:link?.href,updated:value("updated")||value("published"),
   title:value("title"),summary:value("summary")||value("description"),
   rights_markers:[value("rights"),value("copyright"),...licenseLinks.map(x=>x.href)].filter(Boolean).join(" ")});
 }
 if(rows.length)return rows;
 for(const match of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item\s*>/giu)){
  const block=match[1],value=name=>{
   const rx=new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}\\s*>`,'iu');
   return stripMarkup(block.match(rx)?.[1]??"");
  };
  const licenseLinks=[...block.matchAll(/<link\b([^>]*)\/?\s*>/giu)].map(m=>m[1])
   .filter(attrs=>/\brel=["']license["']/iu.test(attrs)).map(attrs=>attrs.match(/\bhref=["']([^"']+)["']/iu)?.[1]).filter(Boolean);
  rows.push({id:value("guid")||value("link"),link:value("link"),updated:value("pubDate"),
   title:value("title"),summary:value("description"),
   rights_markers:[value("rights"),value("copyright"),...licenseLinks].filter(Boolean).join(" ")});
 }
 return rows;
}
function htmlLicenseEvidence(page,rights,itemUrl){
 const url=rights.rights_evidence.licence_url;
 const escaped=url.replace(/[.*+?^${}()|[\]\\]/gu,"\\$&");
 const anchor=new RegExp(`<a\\b(?=[^>]*\\brel=["']license["'])(?=[^>]*\\bhref=["']${escaped}["'])[^>]*>([\\s\\S]*?)<\\/a\\s*>`,'iu').exec(page)
  ??new RegExp(`<a\\b(?=[^>]*\\bhref=["']${escaped}["'])(?=[^>]*\\brel=["']license["'])[^>]*>([\\s\\S]*?)<\\/a\\s*>`,'iu').exec(page);
 if(!anchor)return null;
 const marker=stripMarkup(anchor[1]);
 if(!marker||marker.length>120)return null;
 // Fail closed on item-level exclusions or restriction markers. Boilerplate
 // OGL terms are not treated as an item exception; only the actual content
 // page is retained for this bounded check.
 const text=stripMarkup(page);
 if(/non[- ]commercial|not for commercial use|all rights reserved|third[- ]party (?:copyright|content|material)|except where otherwise stated[^.]{0,100}(?:this|item|image|content)/iu.test(text))return null;
 return {marker,text:`${marker} ${url} ${rights.rights_evidence.terms_url}`,
  item_url:itemUrl};
}
function normalizedEntryCandidate(entry,feed,rights,page,feedOrigin="RSS"){
 const category=CATEGORY_BY_FEED[feed.risk_category];
 if(!category||!entry.id||!entry.link||!entry.updated)return null;
 let sourceUrl;try{sourceUrl=new URL(entry.link)}catch{return null}
 if(sourceUrl.protocol!=="https:"||!(sourceUrl.hostname===rights.publisher_root_domain||
  sourceUrl.hostname.endsWith("."+rights.publisher_root_domain)))return null;
 const evidence=htmlLicenseEvidence(page,rights,sourceUrl.href);if(!evidence)return null;
 const itemRights=String(entry.rights_markers??"");
 if(/non[- ]commercial|not for commercial use|all rights reserved|third[- ]party|third party|restricted|no derivatives|\bcc[- ]?by[- ]?nc\b/iu.test(itemRights))return null;
 const declaredLicenses=[...itemRights.matchAll(/https:\/\/[^\s<>"']+/giu)].map(x=>x[0].replace(/[),.;]+$/u,""));
 if(declaredLicenses.some(url=>url!==rights.rights_evidence.licence_url&&url!==rights.rights_evidence.terms_url))return null;
 const corpus=`${entry.title} ${entry.summary}`.toLowerCase();
 const eventType=CATEGORY_TERMS[category].find(([rx,type])=>rx.test(corpus)&&
  (category!=="CRITICAL_MINERALS"||/mineral|lithium|cobalt|copper|rare earth|graphite/iu.test(corpus)))?.[1];
 if(!eventType)return null;
 const countries=Object.entries(COUNTRY_TERMS).filter(([iso,names])=>iso!==SOURCE_COUNTRY[rights.source_id]&&names.some(name=>
  new RegExp(`(?:^|[^\\p{L}])${name.replace(/[.*+?^${}()|[\]\\]/gu,"\\$&")}(?:$|[^\\p{L}])`,'iu').test(corpus)));
 // Prefer a uniquely named subject country. When the publisher is an
 // official national source and the item has no foreign-country mention,
 // the reviewed publisher jurisdiction is the conservative subject.
 if(countries.length>1)return null;
 const country_iso3=countries[0]?.[0]??SOURCE_COUNTRY[rights.source_id];
 if(!country_iso3)return null;
 const published=new Date(entry.updated);
 if(!Number.isFinite(published.getTime()))return null;
 const published_at=published.toISOString();
 const event_identity={country_iso3,event_type:eventType,actor_id:rights.parent_media_entity,
  target_id:country_iso3.toLowerCase()+"_policy_subject",location_id:country_iso3.toLowerCase()+"_national_scope",
  occurred_at:published_at};
 const raw_payload=JSON.stringify({id:entry.id,link:sourceUrl.href,updated:entry.updated,
  country_iso3,category,license_marker:evidence.marker,license_url:rights.rights_evidence.licence_url,
  terms_url:rights.rights_evidence.terms_url});
 const original={schema:"geomacro.risk-stream-original.v1",kind:"VERIFIED_ORIGINAL",country_iso3,
  category,feed_origin:feedOrigin,source_id:rights.source_id,source_role:rights.source_role,
  publisher_root_domain:rights.publisher_root_domain,parent_media_entity:rights.parent_media_entity,
  source_url:sourceUrl.href,published_at,event_identity,raw_payload,
  reporting_position:"confirms",
  item_license_evidence:{license_id:"UK_OGL_V3",license_url:rights.rights_evidence.licence_url,
   terms_url:rights.rights_evidence.terms_url,item_url:sourceUrl.href,item_license_marker:evidence.marker,
   publisher_owned_content_only:true,third_party_exceptions:false,non_commercial:false,
   restricted_material:false,factual_record_only:true,original_text_republished:false},
  derived:{what:"A dated official action has been published for a specifically identified jurisdiction.",
   why:"The recorded policy signal may alter the jurisdiction's exposure to the affected risk.",
   market:"Relevant counterparties may adjust risk limits while the signal is assessed.",
   watch:"Monitor subsequent official measures and independent corroboration."}};
 const identity=eventIdentityFields(original);
 return {...original,...identity};
}

function load(){
 const rights=JSON.parse(readFileSync(RIGHTS_PATH,"utf8"));
 const feeds=JSON.parse(readFileSync(FEEDS_PATH,"utf8"));
 if(rights.schema!=="geomacro.risk-stream-source-rights-reviewed.v1"||
    !Array.isArray(rights.entries)||feeds.schema!=="geomacro.unified-rss-feed-registry.v1"||
    !Array.isArray(feeds.sources))fail("REGISTRY_INVALID");
 return {rights,feeds};
}

/** Read only approved, opt-in feeds; discard metadata-only entries before emitting JSONL. */
export async function collectRiskStreamFeedExtensions({collector="direct",now=Date.now(),
 fetchImpl=fetch,rightsManifest,feeds,sourceRegistry}={}){
 if(!["direct","private","render"].includes(collector))fail("COLLECTOR_INVALID");
 const loaded=rightsManifest&&feeds?{rights:rightsManifest,feeds}:{...load()};
 const manifest=loaded.rights,registry=loaded.feeds;
 const approved=new Map(manifest.entries.filter(row=>row.status==="APPROVED")
  .map(row=>[row.source_id,row]));
 const sources=sourceRegistry??manifest.entries.map(row=>({...row,enabled:1,commercial_rights_approved:1}));
 const originals=[],counts={feeds_checked:0,extensions_seen:0,
  standard_entries_seen:0,standard_candidates_built:0,feeds_without_candidate_extension:0,invalid:0,
  invalid_by_code:{}};
 for(const feed of registry.sources){
  if(feed.risk_stream_item_licensed!==true||
     feed.risk_stream_standard_item_license_candidate!==true)continue;
  const rights=approved.get(feed.name);
  if(!rights)continue;
  let url;try{url=new URL(feed.url)}catch{continue}
  if(url.protocol!=="https:"||!(url.hostname===rights.publisher_root_domain||
     url.hostname.endsWith("."+rights.publisher_root_domain)))continue;
  counts.feeds_checked++;
  let response;
  try{response=await fetchImpl(url.href,{method:"GET",redirect:"error",
   signal:AbortSignal.timeout(15_000),
   headers:{Accept:"application/atom+xml, application/rss+xml, application/xml, application/feed+json, application/json"}})}
  catch{continue}
  if(!response?.ok)continue;
  let body;try{body=await boundedText(response)}catch{continue}
  let extensions;try{extensions=extractRiskStreamFeedExtensions(body)}catch{counts.invalid++;continue}
  if(extensions.length===0)counts.feeds_without_candidate_extension++;
  const standard=standardEntries(body);
  const feedOrigin=/json/iu.test(response.headers?.get?.("content-type")??"")||/^[\s]*[\[{]/u.test(body)?"OFFICIAL_API":"RSS";
  const built=await Promise.all(standard.slice(0,5).map(async entry=>{
   counts.standard_entries_seen++;
   let page="";
   try{const pageResponse=await fetchImpl(entry.link,{method:"GET",redirect:"error",
    signal:AbortSignal.timeout(15_000),headers:{Accept:"text/html"}});
    if(!pageResponse?.ok)return null;page=await boundedText(pageResponse);
   }catch{return null}
   const original=normalizedEntryCandidate(entry,feed,rights,page,feedOrigin);if(!original)return null;
   counts.standard_candidates_built++;
   try{prepareRiskStreamCandidate(original,sources,now,{rightsManifest:manifest});return original}
   catch(error){counts.invalid++;const code=String(error?.message??"INVALID").slice(0,100);
    counts.invalid_by_code[code]=(counts.invalid_by_code[code]??0)+1;return null}
  }));
  originals.push(...built.filter(Boolean));
  for(const original of extensions){
   counts.extensions_seen++;
   if(original.source_id!==feed.name||original.feed_origin!=="RSS"||
      CATEGORY_BY_FEED[feed.risk_category]!==original.category){
    counts.invalid++;continue;
   }
   try{
    prepareRiskStreamCandidate(original,sources,now,{rightsManifest:manifest});
    originals.push(original);
   }catch{counts.invalid++;}
  }
 }
 return {schema:"geomacro.risk-stream-collector-candidate-sidecar.v1",collector,
  status:originals.length?"ITEM_LICENSE_VERIFIED_CANDIDATES_READY":"NO_ITEM_LICENSE_VERIFIED_CANDIDATES",
  originals,counts};
}

async function main(){
 const args=process.argv.slice(2),value=key=>{const i=args.indexOf(key);return i<0?null:args[i+1]??null};
 const collector=value("--collector"),output=value("--output");
 if(!collector||!output)fail("COLLECTOR_AND_OUTPUT_REQUIRED");
 const result=await collectRiskStreamFeedExtensions({collector});
 writeFileSync(output,result.originals.map(row=>JSON.stringify(row)).join("\n")+
  (result.originals.length?"\n":""),{encoding:"utf8",mode:0o600,flag:"w"});
 const {originals,...receipt}=result;
 console.log(JSON.stringify({...receipt,candidate_count:originals.length,raw_payloads_logged:false}));
}
if(import.meta.url===new URL(process.argv[1],"file:").href)
 main().catch(error=>{console.error(String(error?.message??"RISK_STREAM_FEED_EXTENSION_FAILED").slice(0,120));process.exitCode=2});
