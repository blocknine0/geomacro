#!/usr/bin/env node
/** Fetch hash-only Telegram watch metadata from the protected control-plane API
 * and append redacted Lane B pointers to the runner-local Lane A radar batch. */
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync} from "node:fs";
import {resolve,sep} from "node:path";
import {pathToFileURL} from "node:url";
import {redactedRightsRadar} from "../lib/rights-redacted-speed-radar.mjs";

const fail=code=>{throw Error(code)};
const categories={geopolitics:"geopolitics",macro:"macro",rare_earth:"rare_earth"};
const WATCH_EVENTS=new Set(["conflict","sanctions","export_ban","chokepoint_disruption",
 "fx_sovereign_stress","critical_mineral_supply_shock"]);
export function telegramWatchItemsToRadar(items,{now=Date.now()}={}){
 if(!Array.isArray(items))fail("TELEGRAM_RADAR_ITEMS_INVALID");
 const cutoff=now-25*3600000,signals=[];
 for(const item of items){
  const category=categories[item.category],at=Date.parse(item.source_timestamp_claimed_at);
  if(!category||!/^[A-Z]{3}$/u.test(item.country_iso3??"")||
     !WATCH_EVENTS.has(item.watch_event)||!Number.isFinite(at)||at<cutoff||at>now||
     item.source_content_included!==false||item.raw_article_included!==false)continue;
  const claim=createHash("sha256").update([
   item.country_iso3,category,item.watch_event,new Date(at).toISOString()
  ].join("\n")).digest("hex");
  signals.push(redactedRightsRadar({country_iso3:item.country_iso3,category,
   same_event_claim_sha256:claim,original_published_at:new Date(at).toISOString(),
   severity_delta:0,corroboration_count:0}));
 }
 return signals;
}
async function main(){
const now=Date.now();
const temp=resolve(String(process.env.RUNNER_TEMP??"/never"));
const output=resolve(String(process.env.GEOMACRO_RISK_STREAM_RADAR_FILE??"/missing"));
if(!output.startsWith(temp+sep))fail("RADAR_PATH_INVALID");
const base=String(process.env.CONTROL_PLANE_URL??"").replace(/\/+$/u,"");
const token=String(process.env.CONTROL_PLANE_TOKEN??"");
if(!/^https:\/\//u.test(base)||token.length<32)fail("TELEGRAM_RADAR_AUTH_REQUIRED");
let signals=[],status="READ_OK";
try{
 for(const offset of ["0","100","200"]){
  const url=new URL("/v1/internal/telegram-research-json",base);
  url.searchParams.set("offset",offset);
  const response=await fetch(url,{headers:{Authorization:"Bearer "+token,Accept:"application/json"},
   signal:AbortSignal.timeout(15000),redirect:"error"});
  if(!response.ok)fail("TELEGRAM_RADAR_HTTP_"+response.status);
  const body=await response.json();
  if(body?.ok!==true||body.schema!=="geomacro.telegram-research-json.v1"||!Array.isArray(body.items))
   fail("TELEGRAM_RADAR_RESPONSE_INVALID");
  signals.push(...telegramWatchItemsToRadar(body.items,{now}));
  if(body.has_more!==true)break;
 }
}catch(error){status=String(error?.message??"TELEGRAM_RADAR_READ_FAILED").slice(0,100);signals=[];}
let existing=[];
try{
 const batch=JSON.parse(readFileSync(output,"utf8"));
 if(batch?.schema!=="geomacro.rights-redacted-speed-radar-batch.v1"||!Array.isArray(batch.signals))
  fail("RADAR_BATCH_INVALID");
 existing=batch.signals;
}catch(error){if(error?.code!=="ENOENT")throw error;}
const byClaim=new Map([...existing,...signals].map(signal=>[signal.claim_sha256,signal]));
const merged=[...byClaim.values()];
writeFileSync(output,JSON.stringify({schema:"geomacro.rights-redacted-speed-radar-batch.v1",
 signals:merged})+"\n",{encoding:"utf8",mode:0o600,flag:"w"});
console.log(JSON.stringify({schema:"geomacro.telegram-speed-radar-receipt.v1",status,
 telegram_watch_signals:signals.length,combined_signals:merged.length,
 raw_telegram_text_written:false,raw_telegram_links_written:false,
 raw_sources_not_republished:true,source_content_included:false}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 main().catch(error=>{console.error(String(error?.message??"TELEGRAM_RADAR_FAILED").slice(0,120));process.exitCode=2;});
