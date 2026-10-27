#!/usr/bin/env node
/**
 * Independently verify the live D1-derived website journal.
 * Network retries are bounded and source-neutral; no card prose is logged.
 */
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {isSafeDerivedNewsReadbackSignal} from "../lib/derived-news-readback-policy.mjs";

export const DERIVED_NEWS_PUBLIC_READBACK_ENDPOINT =
  "https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/website-derived-news-immediate";
const MAX_BODY_CHARS=900_000;
const MAX_ROWS=250;
const RETENTION_MS=72*60*60_000;
const CATEGORIES=["geopolitics","macro","rare_earth"];
const RETRYABLE_HTTP=new Set([408,425,429,500,502,503,504]);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function contractValid(doc,nowMs){
  if(!doc || typeof doc!=="object" || Array.isArray(doc) ||
    doc.ok!==true || doc.schema!=="geomacro.website-derived-news-feed.v1" ||
    (doc.original_release_delay_minutes!==0&&doc.original_release_delay_minutes!==15) ||
    doc.retention_days!==3 || doc.retention_hours!==72 ||
    doc.delivery_scope!=="free_website_only" ||
    !Array.isArray(doc.signals) || doc.signals.length>MAX_ROWS) return false;
  const ids=new Set();
  for(const signal of doc.signals){
    if(!signal || typeof signal!=="object" || Array.isArray(signal) ||
      typeof signal.id!=="string" || signal.id.length<1 || signal.id.length>160 ||
      ids.has(signal.id) || !CATEGORIES.includes(signal.category) ||
      signal.severity!==null || signal.same_event_corrob_verified!==false ||
      !isSafeDerivedNewsReadbackSignal(signal)) return false;
    const published=Date.parse(signal.published_at??"");
    if(!Number.isFinite(published) || published>nowMs ||
      nowMs-published>RETENTION_MS) return false;
    if(signal.status==="official_release_observed_unscored" &&
       typeof signal.topic==="string" && signal.topic.endsWith(" publisher candidate")) return false;
    if(signal.status==="official_feed_candidate_unscored" &&
      !(signal.development_type==="unclassified publisher update" &&
        signal.geography===null &&
        ((signal.category==="geopolitics"&&signal.topic==="geopolitical publisher candidate") ||
         (signal.category==="macro"&&signal.topic==="macro publisher candidate") ||
         (signal.category==="rare_earth"&&signal.topic==="minerals publisher candidate")))) return false;
    if(!["official_release_observed_unscored","official_feed_candidate_unscored",
         "osint_feed_observed_unverified"].includes(signal.status)) return false;
    ids.add(signal.id);
  }
  return true;
}

/**
 * Fail closed on bad response contracts. Retry only network/body transport
 * failures and explicitly transient HTTP statuses; never retry a 401/403/404.
 */
export async function verifyDerivedNewsPublicReadback({
  fetchImpl=fetch,
  now=new Date(),
  maxAttempts=4,
  baseDelayMs=250,
  sleepImpl=sleep,
}={}){
  if(typeof fetchImpl!=="function" || !(now instanceof Date) ||
    !Number.isFinite(now.getTime()) || !Number.isInteger(maxAttempts) ||
    maxAttempts<1 || maxAttempts>4 || !Number.isFinite(baseDelayMs) ||
    baseDelayMs<0 || baseDelayMs>2000 || typeof sleepImpl!=="function")
    throw Error("DERIVED_NEWS_PUBLIC_READBACK_CONFIGURATION_INVALID");
  let lastError="DERIVED_NEWS_PUBLIC_READBACK_TRANSPORT_FAILED";
  let attempts=0;
  for(let index=0;index<maxAttempts;index++){
    attempts++;
    let response;
    try{
      response=await fetchImpl(DERIVED_NEWS_PUBLIC_READBACK_ENDPOINT,{
        method:"GET",redirect:"error",cache:"no-store",
        // Force an independent D1 read; avoid cache-hit false acceptance.
        headers:{Accept:"application/json","Cache-Control":"no-cache"},
        signal:AbortSignal.timeout(12_000),
      });
    }catch{
      lastError="DERIVED_NEWS_PUBLIC_READBACK_TRANSPORT_FAILED";
      if(index+1<maxAttempts){await sleepImpl(baseDelayMs*(index+1));continue;}
      break;
    }
    if(response?.redirected)throw Error("DERIVED_NEWS_PUBLIC_READBACK_REDIRECT_REJECTED");
    const status=Number(response?.status??0);
    if(status!==200){
      lastError=status>0&&status<600
        ?"DERIVED_NEWS_PUBLIC_READBACK_HTTP_"+status
        :"DERIVED_NEWS_PUBLIC_READBACK_TRANSPORT_FAILED";
      if(RETRYABLE_HTTP.has(status)&&index+1<maxAttempts){
        await sleepImpl(baseDelayMs*(index+1));continue;
      }
      throw Error(lastError);
    }
    const length=Number(response.headers?.get("content-length")??0);
    if(length>MAX_BODY_CHARS)throw Error("DERIVED_NEWS_PUBLIC_READBACK_OVERSIZE");
    let raw;
    try{raw=await response.text();}
    catch{
      lastError="DERIVED_NEWS_PUBLIC_READBACK_BODY_TRANSPORT_FAILED";
      if(index+1<maxAttempts){await sleepImpl(baseDelayMs*(index+1));continue;}
      break;
    }
    if(raw.length>MAX_BODY_CHARS)throw Error("DERIVED_NEWS_PUBLIC_READBACK_OVERSIZE");
    let doc;
    try{doc=JSON.parse(raw);}
    catch{
      lastError="DERIVED_NEWS_PUBLIC_READBACK_JSON_INVALID";
      if(index+1<maxAttempts){await sleepImpl(baseDelayMs*(index+1));continue;}
      break;
    }
    if(!contractValid(doc,now.getTime()))
      throw Error("DERIVED_NEWS_PUBLIC_READBACK_CONTRACT_INVALID");
    const domainCounts=Object.fromEntries(CATEGORIES.map(category=>{
      const rows=doc.signals.filter(s=>s.category===category);
      return [category,{
        stored_72h:rows.length,
        original_last_24h:rows.filter(s=>
          Date.parse(s.published_at)>=now.getTime()-24*60*60_000).length,
      }];
    }));
    return Object.freeze({
      schema:"geomacro.website-derived-news-readback-receipt.v1",
      verified:true,http_status:200,read_attempts:attempts,
      derived_rows:doc.signals.length,
      categories:domainCounts,
      original_release_delay_minutes:doc.original_release_delay_minutes,
      retention_hours_verified:72,
      original_clock_window_verified:true,
      source_content_logged:false,raw_upstream_disclosed:false,
      supabase_dependency:false,payments_performed:0,
    });
  }
  throw Error(lastError);
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    console.log(JSON.stringify(await verifyDerivedNewsPublicReadback()));
  }catch(error){
    // Only stable error codes are printed; never log URLs, response bodies or source content.
    console.error(error instanceof Error ? error.message : "DERIVED_NEWS_PUBLIC_READBACK_FAILED");
    process.exitCode=1;
  }
}
