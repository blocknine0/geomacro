#!/usr/bin/env node
/**
 * Owner-only original-ID cohort parity. No original content or IDs in logs.
 * Capture: node scripts/ops/predge-paired-read-v2.mjs capture /private/ours.json
 * Compare: node scripts/ops/predge-paired-read-v2.mjs compare /private/ours.json /private/theirs.json
 * Predge JSON: {generated_at,received_at,items:[{id,category,original_published_at}]}
 */
import {readFileSync,writeFileSync} from "node:fs";
const BASE="https://geomacro-control-plane.daspallab202391.workers.dev";
const CATS=["geopolitics","macro","rare_earth"];
const iso=v=>typeof v==="string"?Date.parse(v):NaN;
function assert(v,msg){if(!v)throw Error("PAIRED_READ_"+msg);}
function clean(input){
 assert(input&&typeof input==="object"&&Array.isArray(input.items)&&input.items.length<=600,"FORMAT");
 assert(Number.isFinite(iso(input.generated_at))&&Number.isFinite(iso(input.received_at)),"CLOCKS");
 const ids=new Set();
 const items=input.items.map(x=>{
  assert(x&&typeof x.id==="string"&&x.id.length>0&&x.id.length<=256&&
   CATS.includes(x.category)&&Number.isFinite(iso(x.original_published_at))&&!ids.has(x.id),"ITEM");
  ids.add(x.id);
  return {id:x.id,category:x.category,original_published_at:x.original_published_at};
 });
 return {generated_at:input.generated_at,received_at:input.received_at,items};
}
async function capture(path){
 const token=process.env.PREDGE_RESEARCH_NEWS_TOKEN_OVERRIDE;
 assert(/^[a-f0-9]{64}$/.test(token??""),"TOKEN_NOT_PROVISIONED");
 const r=await fetch(BASE+"/v1/partner/predge/derived-structural-72h",{
  redirect:"error",cache:"no-store",headers:{authorization:"Bearer "+token},
  signal:AbortSignal.timeout(20000)});
 assert(r.status===200,"FEED_HTTP_"+r.status);
 const raw=await r.text();assert(Buffer.byteLength(raw)<4_000_000,"OVERSIZE");
 const body=JSON.parse(raw);
 assert(body.ok===true&&body.schema==="geomacro.derived-news-structural-feed.v1"&&
  body.projection==="attributed_research","FEED_CONTRACT");
 const minimal=clean({generated_at:body.generated_at,received_at:new Date().toISOString(),items:body.items});
 writeFileSync(path,JSON.stringify(minimal),{flag:"wx",mode:0o600});
 console.log(JSON.stringify({status:"CAPTURED_PRIVATE_IDS",items:minimal.items.length,
  generated_at:minimal.generated_at,content_logged:false}));
}
function compare(a,b){
 const skew=Math.abs(iso(a.generated_at)-iso(b.generated_at));
 const receivedSkew=Math.abs(iso(a.received_at)-iso(b.received_at));
 const validCohort=skew<=90_000&&receivedSkew<=90_000;
 const ours=new Map(a.items.map(x=>[x.id,x])),theirs=new Map(b.items.map(x=>[x.id,x]));
 const diff=Object.fromEntries(CATS.map(c=>[c,{ours:a.items.filter(x=>x.category===c).length,
  theirs:b.items.filter(x=>x.category===c).length,ours_only:0,theirs_only:0,
  mismatched_clock_or_category:0}]));
 for(const x of a.items){
  const y=theirs.get(x.id);
  if(!y)diff[x.category].ours_only++;
  else if(y.category!==x.category||y.original_published_at!==x.original_published_at)
   diff[x.category].mismatched_clock_or_category++;
 }
 for(const x of b.items)if(!ours.has(x.id))diff[x.category].theirs_only++;
 return {schema:"geomacro.predge-paired-id-cohort-v2",verdict:validCohort?
  "SAME_MINUTE_ID_COMPARISON":"DIFFERENT_COHORT_INCONCLUSIVE",
  generated_skew_seconds:Math.round(skew/1000),
  received_skew_seconds:Math.round(receivedSkew/1000),by_category:diff,
  raw_ids_logged:false,content_logged:false};
}
async function main(){
 const [mode,left,right]=process.argv.slice(2);
 if(mode==="capture"&&left&&!right)return capture(left);
 if(mode==="compare"&&left&&right){
  const a=clean(JSON.parse(readFileSync(left,"utf8")));
  const b=clean(JSON.parse(readFileSync(right,"utf8")));
  console.log(JSON.stringify(compare(a,b)));return;
 }
 throw Error("USAGE");
}
main().catch(e=>{console.error(String(e.message).replace(/[^A-Za-z0-9_]/g,"_").slice(0,120));
 process.exitCode=1;});
