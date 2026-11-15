#!/usr/bin/env node
import {readFileSync,writeFileSync} from "node:fs";
import {prepareRiskStreamCandidate} from "../lib/risk-stream-candidate-builder.mjs";

const fail=code=>{throw Error("RISK_STREAM_FEED_EXTENSION_"+code)};
const RIGHTS_PATH="config/risk-stream-source-rights-reviewed.v1.json";
const FEEDS_PATH="config/unified-rss-feed-registry.v1.json";
const MAX_FEED_BYTES=2_000_000;
const CATEGORY_BY_FEED={conflict:"GEOPOLITICS",macro_economics:"MACRO_FX",
 commodities:"CRITICAL_MINERALS"};
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
  feeds_without_candidate_extension:0,invalid:0};
 for(const feed of registry.sources){
  if(feed.risk_stream_item_licensed!==true||
     feed.risk_stream_candidate_extension!=="geomacro_risk_stream_candidate")continue;
  const rights=approved.get(feed.name);
  if(!rights)continue;
  let url;try{url=new URL(feed.url)}catch{continue}
  if(url.protocol!=="https:"||!(url.hostname===rights.publisher_root_domain||
     url.hostname.endsWith("."+rights.publisher_root_domain)))continue;
  counts.feeds_checked++;
  let response;
  try{response=await fetchImpl(url.href,{method:"GET",redirect:"error",
   signal:AbortSignal.timeout(15_000),
   headers:{Accept:"application/atom+xml, application/rss+xml, application/xml"}})}
  catch{continue}
  if(!response?.ok)continue;
  let body;try{body=await boundedText(response)}catch{continue}
  let extensions;try{extensions=extractRiskStreamFeedExtensions(body)}catch{counts.invalid++;continue}
  if(extensions.length===0)counts.feeds_without_candidate_extension++;
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
