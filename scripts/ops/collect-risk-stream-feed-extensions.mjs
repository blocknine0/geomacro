#!/usr/bin/env node
import {readFileSync,writeFileSync} from "node:fs";
import {prepareRiskStreamCandidate} from "../lib/risk-stream-candidate-builder.mjs";
import {eventIdentityFields} from "../lib/risk-stream-event-fingerprint.mjs";
import {prioritizeApprovedAnchorSources} from "../lib/rights-redacted-speed-radar.mjs";
import {resolve,sep} from "node:path";

const fail=code=>{throw Error("RISK_STREAM_FEED_EXTENSION_"+code)};
const RIGHTS_PATH="config/risk-stream-source-rights-reviewed.v1.json";
const FEEDS_PATH="config/unified-rss-feed-registry.v1.json";
const MAX_FEED_BYTES=2_000_000;
const CATEGORY_BY_FEED={conflict:"GEOPOLITICS",macro_economics:"MACRO_FX",
 commodities:"CRITICAL_MINERALS"};
export const CRITICAL_MINERAL_SUPPLY_TERMS=/mineral|lithium|cobalt|copper|rare earth|graphite|nickel|manganese|titanium|tungsten|gallium|germanium|uranium|silicon|zinc|aluminum|aluminium|bauxite|platinum|palladium|antimony|vanadium|mining|\bmine\b|smelter|refining|refinery|ore|metal|battery|supply chain|export control|critical raw/iu;
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
  [CRITICAL_MINERAL_SUPPLY_TERMS,"critical_mineral_supply"],
  [/trade|customs/iu,"trade_disruption"]]
};
const EVENT_COPY=Object.freeze({
 sanctions_policy:"SANCTIONS_POLICY: jurisdictional restrictions tighten.",
 ceasefire:"CEASEFIRE: operational security conditions enter a transition.",
 conflict_escalation:"CONFLICT_ESCALATION: security pressure increases.",
 trade_disruption:"TRADE_DISRUPTION: cross-border access faces a policy or logistics change.",
 central_bank_policy:"CENTRAL_BANK_POLICY: monetary stance or policy settings change.",
 inflation_release:"INFLATION_RELEASE: consumer-price conditions receive a dated update.",
 fx_intervention:"FX_INTERVENTION: currency liquidity or exchange-rate action changes.",
 critical_mineral_export_control:"CRITICAL_MINERAL_EXPORT_CONTROL: mineral trade access tightens.",
 critical_mineral_production:"CRITICAL_MINERAL_PRODUCTION: mine or processing output changes.",
 critical_mineral_supply:"CRITICAL_MINERAL_SUPPLY: material availability or supply-chain terms change.",
});
export const COUNTRY_TERMS={USA:["united states","united states of america","u.s.","u.s.a.","usa","american"],GBR:["united kingdom","great britain","britain","british","english","uk"],
 CHN:["china","chinese"],IND:["india","indian"],RUS:["russia","russian"],
 UKR:["ukraine","ukrainian"],ISR:["israel","israeli"],PSE:["palestine","palestinian","gaza"],
 IRN:["iran","iranian"],SAU:["saudi arabia","saudi"],ARE:["united arab emirates","uae"],
 AUS:["australia","australian"],CAN:["canada","canadian"],BRA:["brazil","brazilian"],
 ZAF:["south africa"],IDN:["indonesia","indonesian"],CHL:["chile","chilean"],PER:["peru","peruvian"],
 JPN:["japan","japanese"],KOR:["south korea","korea","korean"],BEL:["belgium","belgian"],DEU:["germany","german"],
 FRA:["france","french"],MEX:["mexico","mexican"],ITA:["italy","italian"],ESP:["spain","spanish"],NLD:["netherlands","dutch"],
 CHE:["switzerland","swiss"],NOR:["norway","norwegian"],SWE:["sweden","swedish"],POL:["poland","polish"],
 TUR:["turkey","türkiye","turkiye","turkish"],EGY:["egypt","egyptian"],QAT:["qatar","qatari"],OMN:["oman","omani"],
 IRQ:["iraq","iraqi"],NGA:["nigeria","nigerian"],COD:["democratic republic of the congo","dr congo","congo"],ZMB:["zambia","zambian"],
 ARG:["argentina","argentine"],BOL:["bolivia","bolivian"],VNM:["vietnam","vietnamese"],THA:["thailand","thai"],
 MYS:["malaysia","malaysian"],SGP:["singapore","singaporean"],PHL:["philippines","philippine","filipino"],PAK:["pakistan","pakistani"],
 BGD:["bangladesh","bangladeshi"],KAZ:["kazakhstan","kazakh"],MNG:["mongolia","mongolian"],MMR:["myanmar","burma","burmese"]};
const normalizeSovereignIso3=value=>value==="ATA"?"AUS":value;
export const HOT50=new Set(["USA","CHN","IND","RUS","GBR","DEU","FRA","JPN","KOR","BEL","CAN","AUS","BRA","MEX","ITA","ESP","NLD","CHE","NOR","SWE","POL","UKR","TUR","SAU","ARE","IRN","ISR","EGY","QAT","OMN","IRQ","ZAF","NGA","COD","ZMB","CHL","PER","ARG","BOL","IDN","VNM","THA","MYS","SGP","PHL","PAK","BGD","KAZ","MNG","MMR"]);
export const SOURCE_COUNTRY={uk_fcdo_ogl_official_atom:"GBR",uk_obr_ogl_macro_atom:"GBR",
 uk_dbt_ogl_minerals_atom:"GBR",uk_hmt_ogl_official_atom:"GBR",uk_desnz_ogl_minerals_atom:"GBR",
 uk_mod_ogl_security_atom:"GBR",uk_cabinet_ogl_security_atom:"GBR",uk_bist_ogl_minerals_atom:"GBR",
 ecb_fx_reference_rates:"DEU",us_fed_h10_public_domain:"USA",usgs_minerals_public_domain:"USA",
 geoscience_australia_ccby:"AUS",eu_jrc_rmis_ccby:"BEL"};
export function matchHot50Countries(entry={},corpus=`${entry.title??""} ${entry.summary??""}`,sourceId=null){
 const direct=[entry.country_iso3,...(entry.countries??[])].map(value=>String(value??"").toUpperCase());
 const mentioned=Object.entries(COUNTRY_TERMS).filter(([,names])=>names.some(name=>
  new RegExp(`(?:^|[^\\p{L}])${name.replaceAll(".","\\.")}(?:$|[^\\p{L}])`,'iu').test(corpus))).map(([iso])=>iso);
 const countries=[...new Set([...direct,...mentioned].map(normalizeSovereignIso3)
  .filter(iso=>HOT50.has(iso)&&iso!==SOURCE_COUNTRY[sourceId]))].slice(0,3);
 if(!countries.length&&SOURCE_COUNTRY[sourceId])countries.push(SOURCE_COUNTRY[sourceId]);
 return countries;
}
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
   const value=JSON.parse(xml);
   let items=Array.isArray(value)?value:value?.items??value?.entries??value?.data??value?.features??[];
   if(Array.isArray(value)&&value.length===2&&Array.isArray(value[1]))items=value[1];
   if(Array.isArray(items))return items.map(item=>{
    const fields=item?.fields??item?.properties??item??{},date=fields.date;
    const countries=Array.isArray(fields.country)?fields.country.map(row=>typeof row==="string"?row:
     row?.iso3??row?.iso3Code??row?.countryiso3code??row?.name??row?.value).filter(Boolean):[];
    let link=String(fields.href??fields.url??fields.external_url??fields.link??fields.url_alias??
     item?.href??item?.url??item?.link??"");
    if(link.startsWith("/"))link="https://reliefweb.int"+link;
    return {id:String(fields.id??fields.uuid??fields.guid??item?.id??item?.guid??""),
     link,
     updated:String(fields.date_modified??fields.date_published??fields.updated??fields.published??
      date?.created??date?.published??date?.original??""),
     title:stripMarkup(fields.title??fields.name??""),
     summary:stripMarkup(fields.summary??fields.content_text??fields.description??fields.name??""),
     rights_markers:[fields.rights,fields.license,fields.license_url,fields.copyright,
      ...(Array.isArray(fields.tags)?fields.tags:[])].filter(Boolean).join(" "),
     countries,country_iso3:fields.countryiso3code??fields.country_iso3??fields.iso3};
   });
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
 const licenseId=licenseIdFromRights(rights);
 if(!licenseId)return null;
 if(licenseId==="GDELT_FACTS_ONLY")return null;
 if(licenseId==="ECB_REFERENCE_STATISTICS")return null;
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
function licenseIdFromRights(rights){
 const evidence=rights?.rights_evidence;
 if(!evidence||typeof evidence.licence_url!=="string")return null;
 const url=evidence.licence_url;
 if(url==="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/")return "UK_OGL_V3";
 if(url==="https://creativecommons.org/licenses/by/4.0/")return "CC_BY_4.0";
 if(url==="https://creativecommons.org/licenses/by/3.0/")return "CC_BY_3.0";
 if(url==="https://www.usa.gov/government-works")return "US_GOV_PUBLIC_DOMAIN";
 if(url==="https://www.gdeltproject.org/about.html")return "GDELT_FACTS_ONLY";
 if(url==="https://www.ecb.europa.eu/home/html/disclaimer.en.html")return "ECB_REFERENCE_STATISTICS";
 return null;
}
function publisherOwnedForLicense(licenseId){
 return licenseId==="UK_OGL_V3"||licenseId==="US_GOV_PUBLIC_DOMAIN";
}
function normalizedEntryCandidates(entry,feed,rights,page,feedOrigin="RSS"){
 const category=CATEGORY_BY_FEED[feed.risk_category];
 if(!category||!entry.id||!entry.link||!entry.updated)return [];
 let sourceUrl;try{sourceUrl=new URL(entry.link)}catch{return []}
 if(sourceUrl.protocol!=="https:"||!(sourceUrl.hostname===rights.publisher_root_domain||
  sourceUrl.hostname.endsWith("."+rights.publisher_root_domain)))return [];
 const evidence=htmlLicenseEvidence(page,rights,sourceUrl.href);if(!evidence)return [];
 const licenseId=licenseIdFromRights(rights);if(!licenseId)return [];
 const itemRights=String(entry.rights_markers??"");
 if(/non[- ]commercial|not for commercial use|all rights reserved|third[- ]party|third party|restricted|no derivatives|\bcc[- ]?by[- ]?nc\b/iu.test(itemRights))return [];
 const declaredLicenses=[...itemRights.matchAll(/https:\/\/[^\s<>"']+/giu)].map(x=>x[0].replace(/[),.;]+$/u,""));
 if(declaredLicenses.some(url=>url!==rights.rights_evidence.licence_url&&url!==rights.rights_evidence.terms_url))return [];
 const corpus=`${entry.title} ${entry.summary}`.toLowerCase();
 const eventType=CATEGORY_TERMS[category].find(([rx,type])=>rx.test(corpus)&&
  (category!=="CRITICAL_MINERALS"||CRITICAL_MINERAL_SUPPLY_TERMS.test(corpus)))?.[1];
 if(!eventType)return [];
 const countries=matchHot50Countries(entry,corpus,rights.source_id);
 if(!countries.length)return [];
 const published=new Date(entry.updated);
 if(!Number.isFinite(published.getTime()))return [];
 const published_at=published.toISOString();
 return countries.map(country_iso3=>{
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
   item_license_evidence:{license_id:licenseId,license_url:rights.rights_evidence.licence_url,
    terms_url:rights.rights_evidence.terms_url,item_url:sourceUrl.href,item_license_marker:evidence.marker,
    publisher_owned_content_only:publisherOwnedForLicense(licenseId),third_party_exceptions:false,non_commercial:false,
    restricted_material:false,factual_record_only:true,original_text_republished:false},
   derived:{what:EVENT_COPY[eventType],
    why:`Risk classification: ${eventType.replaceAll("_"," ")} in ${country_iso3}; assess the jurisdiction and affected sector before changing exposure.`,
    market:category==="MACRO_FX"?`Potential channels include ${country_iso3} currency liquidity, FX settlement and sovereign financing.`:
     category==="CRITICAL_MINERALS"?`Potential channels include ${country_iso3} mineral throughput, processing availability and benchmark premiums.`:
     `Potential channels include ${country_iso3} operating continuity, trade routing, freight and sovereign risk.`,
    watch:"Track formal implementation, affected counterparties and independent evidence before escalation."}};
  return {...original,...eventIdentityFields(original)};
 });
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
 fetchImpl=fetch,rightsManifest,feeds,sourceRegistry,radarSignals=[]}={}){
 if(!["direct","private","render"].includes(collector))fail("COLLECTOR_INVALID");
 const loaded=rightsManifest&&feeds?{rights:rightsManifest,feeds}:{...load()};
 const manifest=loaded.rights,registry=loaded.feeds;
 const approved=new Map(manifest.entries.filter(row=>row.status==="APPROVED")
  .map(row=>[row.source_id,row]));
 const sources=sourceRegistry??manifest.entries.map(row=>({...row,enabled:1,commercial_rights_approved:1}));
 const priority=prioritizeApprovedAnchorSources(radarSignals,registry.sources.map(feed=>{
  const rights=approved.get(feed.name);
  const sourceRow=sources.find(row=>(row.source_id??row.name)===feed.name);
  const country_iso3=SOURCE_COUNTRY[feed.name]??null;
  return {...feed,source_id:feed.name,
   categories:[CATEGORY_BY_FEED[feed.risk_category]].filter(Boolean),
   country_iso3,global:true,
   enabled:feed.risk_stream_item_licensed===true&&
    feed.risk_stream_standard_item_license_candidate===true&&sourceRow?.enabled===1?1:0,
   commercial_rights_approved:rights&&sourceRow?.commercial_rights_approved===1?1:0};
 }));
 const orderedFeeds=priority.sources;
 const originals=[],counts={feeds_checked:0,extensions_seen:0,
  standard_entries_seen:0,standard_candidates_built:0,feeds_without_candidate_extension:0,invalid:0,
  stale_entries_skipped:0,future_entries_skipped:0,undated_entries_skipped:0,invalid_by_code:{}};
 for(const feed of orderedFeeds){
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
  const current=standard.filter(entry=>{
   const published=Date.parse(entry?.updated??"");
   if(!Number.isFinite(published)){counts.undated_entries_skipped++;return false}
   if(published>now){counts.future_entries_skipped++;return false}
   if(now-published>72*60*60*1000){counts.stale_entries_skipped++;return false}
   return true;
  }).slice(0,25);
  const built=await Promise.all(current.map(async entry=>{
   counts.standard_entries_seen++;
   let page="";
   try{const pageResponse=await fetchImpl(entry.link,{method:"GET",redirect:"error",
    signal:AbortSignal.timeout(15_000),headers:{Accept:"text/html"}});
    if(!pageResponse?.ok)return [];page=await boundedText(pageResponse);
   }catch{return []}
   const candidates=normalizedEntryCandidates(entry,feed,rights,page,feedOrigin);if(!candidates.length)return [];
   const accepted=[];
   for(const original of candidates){
    counts.standard_candidates_built++;
    try{prepareRiskStreamCandidate(original,sources,now,{rightsManifest:manifest});accepted.push(original)}
    catch(error){counts.invalid++;const code=String(error?.message??"INVALID").slice(0,100);
     counts.invalid_by_code[code]=(counts.invalid_by_code[code]??0)+1}
   }
   return accepted;
  }));
  originals.push(...built.flat());
  for(const original of extensions){
   counts.extensions_seen++;
   if(original.source_id!==feed.name||original.feed_origin!=="RSS"||
      CATEGORY_BY_FEED[feed.risk_category]!==original.category){
    counts.invalid++;continue;
   }
   try{
    const normalized=original.country_iso3==="ATA"?{...original,country_iso3:"AUS",
     event_identity:{...original.event_identity,country_iso3:"AUS"}}:original;
    const candidate={...normalized,...eventIdentityFields(normalized)};
    prepareRiskStreamCandidate(candidate,sources,now,{rightsManifest:manifest});
    originals.push(candidate);
   }catch{counts.invalid++;}
  }
 }
 return {schema:"geomacro.risk-stream-collector-candidate-sidecar.v1",collector,
  status:originals.length?"ITEM_LICENSE_VERIFIED_CANDIDATES_READY":"NO_ITEM_LICENSE_VERIFIED_CANDIDATES",
  originals,counts,lane_b_redacted_signals:radarSignals.length,
  lane_a_priority_sources:priority.prioritized_count,
  lane_a_priority_source_ids:priority.prioritized_source_ids};
}

async function main(){
 const args=process.argv.slice(2),value=key=>{const i=args.indexOf(key);return i<0?null:args[i+1]??null};
 const collector=value("--collector"),output=value("--output"),radarFile=value("--radar-file");
 if(!collector||!output)fail("COLLECTOR_AND_OUTPUT_REQUIRED");
 let radarSignals=[];
 if(radarFile){
  const temp=resolve(String(process.env.RUNNER_TEMP??"/never"));
  const path=resolve(radarFile);
  if(!path.startsWith(temp+sep))fail("RADAR_PATH_INVALID");
  const radar=JSON.parse(readFileSync(path,"utf8"));
  if(radar?.schema!=="geomacro.rights-redacted-speed-radar-batch.v1"||
     !Array.isArray(radar.signals))fail("RADAR_BATCH_INVALID");
  radarSignals=radar.signals;
 }
 const result=await collectRiskStreamFeedExtensions({collector,radarSignals});
 writeFileSync(output,result.originals.map(row=>JSON.stringify(row)).join("\n")+
  (result.originals.length?"\n":""),{encoding:"utf8",mode:0o600,flag:"w"});
 const {originals,...receipt}=result;
 console.log(JSON.stringify({...receipt,candidate_count:originals.length,raw_payloads_logged:false}));
}
if(import.meta.url===new URL(process.argv[1],"file:").href)
 main().catch(error=>{console.error(String(error?.message??"RISK_STREAM_FEED_EXTENSION_FAILED").slice(0,120));process.exitCode=2});
