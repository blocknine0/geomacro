#!/usr/bin/env node
// Operator-submitted public RSS / no-key API source candidates.
// Private bounded metadata discovery only. Never republish news copy,
// grant commercial reuse, or convert transport counts to signed intelligence.
import {mkdirSync,writeFileSync,readFileSync} from "node:fs";
import {dirname} from "node:path";
import {pathToFileURL} from "node:url";
const DAY=86400_000;
const MAX_BYTES=768*1024;
const MAX_ITEMS=40;
const OUTPUT="artifacts/expanded-official-source/operator-free-feed-rotation.json";
const FEEDS=Object.freeze([
  {id:"news_bbc",url:"https://feeds.bbci.co.uk/news/world/rss.xml",format:"xml",group:0},
  {id:"fed_press",url:"https://www.federalreserve.gov/feeds/press_all.xml",format:"xml",group:0},
  {id:"re_news_mining",url:"https://www.mining.com/feed/",format:"xml",group:0},
  {id:"ofac_recent_actions",url:"https://ofac.treasury.gov/recent-actions",format:"html",group:0},
  {id:"bls",url:"https://api.bls.gov/publicAPI/v1/timeseries/data/CUUR0000SA0",format:"json",group:0},
  {id:"news_aljazeera",url:"https://www.aljazeera.com/xml/rss/all.xml",format:"xml",group:1},
  {id:"news_dw",url:"https://rss.dw.com/rdf/rss-en-all",format:"xml",group:1},
  {id:"state_tass",url:"https://tass.com/rss/v2.xml",format:"xml",group:1},
  {id:"news_toi",url:"https://timesofindia.indiatimes.com/rssfeeds/296589292.cms",format:"xml",group:1},
  {id:"news_nikkei",url:"https://asia.nikkei.com/rss",format:"xml",group:1},
  {id:"news_scmp",url:"https://www.scmp.com/rss",format:"xml",group:2},
  {id:"news_france24",url:"https://www.france24.com/en/rss",format:"xml",group:2},
  {id:"news_kyivindependent",url:"https://kyivindependent.com/feed/",format:"xml",group:2},
  {id:"state_globaltimes",url:"https://www.globaltimes.cn/rss/outbrain.xml",format:"xml",group:2},
]);
export const PUBLIC_FEED_ROTATION=FEEDS;
const PATTERNS=Object.freeze({
  geopolitics:/\b(?:war|sanctions?|conflict|diplomac|ceasefire|border|attack|treaty|geopolitic|refugee|military|earthquake|crisis|piracy|strike)\b/iu,
  macro:/\b(?:inflation|central bank|interest rate|monetary|fomc|federal reserve|gdp|fx|exchange rate|currency|trade deficit|recession|employment|unemployment|tariff)\b/iu,
  rare_earth:/\b(?:rare[- ]earth|critical mineral|lithium|cobalt|nickel|graphite|gallium|germanium|neodymium|dysprosium|terbium|mining|copper|magnet)\b/iu,
});
function operatorRegistry(){
  const file=readFileSync(new URL("../../config/operator-76-source-attribution-intake.v1.json",import.meta.url),"utf8");
  return new Map(JSON.parse(file).entries.map(x=>[x.id,x]));
}
function metadataFor(feed,reg){
  const item=reg.get(feed.id);
  if(!item||item.runtime_state==="HOLD_PAID_OR_NONCOMMERCIAL"||item.canonical_existing_id||
     item.candidate_endpoint!==feed.url||
     !item.attribution?.source_name)throw Error("OPERATOR_SOURCE_CATALOG_CONTRACT_INVALID");
  const url=new URL(feed.url);
  if(url.protocol!=="https:"||url.username||url.password)throw Error("SOURCE_ENDPOINT_UNSAFE");
  return {id:feed.id,source_name:item.attribution.source_name,domains:item.domains,
    declared_license_unverified:item.operator_license_label_unverified,
    rights_status:"REQUIRES_EXACT_DATASET_COMMERCIAL_REVIEW"};
}
function resultBase(metadata){
  return {...metadata,transport_state:"NOT_ATTEMPTED",request_attempted:false,
    http_requests:0,sampled_metadata_items:0,native_dated_24h_items:0,
    provisional_topic_matches:{geopolitics:0,macro:0,rare_earth:0},
    independent_event_corroboration:false,source_rights_verified_for_commerce:false,
    original_page_publication_verified:false,customer_raw_data_delivered:false,
    current_scored_intelligence_verified:false,signed_gro:false,commercial_eligible:false};
}
async function boundedFetch(feed,fetchImpl){
  let response;
  try{
    response=await fetchImpl(feed.url,{
      method:"GET",redirect:"error",headers:{accept:feed.format==="xml"?"application/rss+xml, application/atom+xml, text/xml;q=0.9, application/xml;q=0.8":feed.format==="json"?"application/json":"text/html"},
      signal:AbortSignal.timeout(8000),
    });
  }catch{return {state:"NETWORK_OR_REDIRECT_UNAVAILABLE"};}
  if([401,403,429].includes(response.status))return {state:"DENIED_OR_RATE_LIMIT"};
  if(!response.ok)return {state:"HTTP_UNAVAILABLE"};
  if(Number(response.headers.get("content-length")||0)>MAX_BYTES)return {state:"BODY_SIZE_LIMIT"};
  if(!response.body)return {state:"EMPTY_BODY"};
  let total=0;const chunks=[];const reader=response.body.getReader();
  try{
    while(true){
      const {done,value}=await reader.read();if(done)break;
      total+=value.byteLength;
      if(total>MAX_BYTES){await reader.cancel();return {state:"BODY_SIZE_LIMIT"};}
      chunks.push(Buffer.from(value));
    }
  }catch{return {state:"INVALID_RESPONSE"};}
  finally{reader.releaseLock();}
  const body=Buffer.concat(chunks).toString("utf8");
  if(!body.trim())return {state:"EMPTY_BODY"};
  return {state:"BODY_OBSERVED",body};
}
function firstTag(block,tag){
  const match=block.match(new RegExp("<(?:[\\w.-]+:)?"+tag+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?"+tag+">","iu"));
  return match?.[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu,"$1").replace(/<[^>]*>/gu," ").slice(0,1000)??"";
}
function parse(feed,body,now){
  if(feed.format==="html"){
    if(!/<(?:!doctype\s+html|html)\b/iu.test(body))return null;
    return {count:0,fresh:null,provisional:{geopolitics:0,macro:0,rare_earth:0},scope:"HTML_TRANSPORT_ONLY_NO_EVENT_EXTRACTION"};
  }
  if(feed.format==="json"){
    try{
      const json=JSON.parse(body);
      if(json?.status!=="REQUEST_SUCCEEDED"||!Array.isArray(json?.Results?.series))return null;
      return {count:json.Results.series.reduce((n,x)=>n+(Array.isArray(x.data)?Math.min(x.data.length,MAX_ITEMS):0),0),
        fresh:null,provisional:{geopolitics:0,macro:0,rare_earth:0},
        scope:"BLS_PUBLIC_V1_REFERENCE_PERIOD_NOT_PUBLICATION_TIME"};
    }catch{return null;}
  }
  // A feed root must be the *actual* XML document root. Merely finding an
  // RSS-looking tag embedded in an HTML error or blog page is NOT a feed.
  const root=body.trimStart()
    .replace(/^<\?xml[^>]*\?>\s*/iu,"")
    .replace(/^(?:<!--[\s\S]*?-->\s*)*/u,"");
  if(!/^<(?:rss|feed|rdf:RDF)\b/iu.test(root))return null;
  const blocks=[...body.matchAll(/<(?:item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/(?:item|entry)>/giu)]
    .slice(0,MAX_ITEMS).map(m=>m[1]);
  const hits={geopolitics:0,macro:0,rare_earth:0};
  let fresh=0;
  for(const item of blocks){
    const title=firstTag(item,"title");
    for(const [domain,re] of Object.entries(PATTERNS))if(re.test(title))hits[domain]++;
    const stamp=firstTag(item,"pubDate")||firstTag(item,"published")||
      firstTag(item,"updated")||firstTag(item,"date");
    const parsed=Date.parse(stamp);
    if(Number.isFinite(parsed)&&parsed<=now.getTime()&&now.getTime()-parsed<=DAY)fresh++;
  }
  return {count:blocks.length,fresh,provisional:hits,
    scope:"FEED_ITEM_DATE_NOT_ORIGINAL_PUBLISHER_PAGE_VALIDATION"};
}
export async function observeOperatorFreeFeedRotation({
  group=null,now=new Date(),fetchImpl=fetch
}={}){
  if(!Number.isFinite(now.getTime()))throw Error("SOURCE_ROTATION_CLOCK_INVALID");
  const g=group===null?Math.floor(now.getTime()/(90*60*1000))%3:group;
  if(!Number.isInteger(g)||g<0||g>2)throw Error("SOURCE_ROTATION_GROUP_INVALID");
  const registry=operatorRegistry();
  const sources=[];
  for(const feed of FEEDS.filter(x=>x.group===g)){
    const base=resultBase(metadataFor(feed,registry));
    const observed=await boundedFetch(feed,fetchImpl);
    const parsed=observed.body?parse(feed,observed.body,now):null;
    const valid=observed.state==="BODY_OBSERVED"&&parsed!==null;
    sources.push({...base,request_attempted:true,http_requests:1,
      transport_state:!valid?(observed.state==="BODY_OBSERVED"?"FORMAT_NOT_VERIFIED":observed.state):
        feed.format==="html"?"HTML_HEALTH_ONLY":"LIVE_PRIVATE_METADATA",
      sampled_metadata_items:parsed?.count??0,
      native_dated_24h_items:parsed?.fresh??null,
      provisional_topic_matches:parsed?.provisional??base.provisional_topic_matches,
      timestamp_precision:parsed?.scope??null,
    });
  }
  return {schema:"geomacro.operator-free-rotating-private-feed-metadata.v1",
    checked_at:now.toISOString(),group:g,groups_total:3,
    next_group_in_90min:"BEST_EFFORT_GITHUB_CRON_NOT_SLA",
    source_count:sources.length,http_requests:sources.reduce((s,x)=>s+x.http_requests,0),
    status:sources.every(x=>["LIVE_PRIVATE_METADATA","HTML_HEALTH_ONLY"].includes(x.transport_state))?
      "GROUP_TRANSPORT_OK":"GROUP_PARTIALLY_DEGRADED",
    sources,rights_and_original_corroboration_unverified:true,
    supabase_requests:0,b2_requests:0,d1_requests:0,
    payments:0,raw_publisher_payload_persisted:false,signed_gro_generated:false};
}
async function main(){
  const group=process.env.OPERATOR_FREE_FEED_GROUP;
  const receipt=await observeOperatorFreeFeedRotation({group:group===undefined?null:Number(group)});
  mkdirSync(dirname(OUTPUT),{recursive:true});
  writeFileSync(OUTPUT,JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
  console.log(JSON.stringify(receipt));
  if(receipt.status!=="GROUP_TRANSPORT_OK")process.exitCode=3;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  await main().catch(err=>{
    console.error("OPERATOR_FREE_FEED_FATAL",String(err?.message).replace(/[^A-Z0-9_]/gu,"").slice(0,70));
    process.exitCode=3;
  });
