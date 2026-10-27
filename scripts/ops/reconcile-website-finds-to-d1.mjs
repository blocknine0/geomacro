#!/usr/bin/env node
/**
 * Website public Finds -> SAME canonical D1 journal catch-up.
 *
 * Only already public, publisher-qualified Geomacro-owned derived cards from
 * the existing static latest.json; no raw article, extra source poll, new DB,
 * Supabase/B2, PREDGE-specific store, credential, payment, or API contract.
 *
 * Existing protected PREDGE endpoint continues reading its immutable D1
 * 72-hour research projection and keeps its own auth / quota / attribution.
 * This writes missing immutable IDs through the SAME approved Geomacro
 * publisher ingress used by the hourly original-source collector.
 */
import {createHmac} from "node:crypto";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {isPermanentArchiveSignal} from "./publish-permanent-derived-news-archive.mjs";
import {verifyDerivedStory} from "../../workers/control-plane/src/website-derived-intelligence.mjs";
import {prepareDerivedNewsBatches} from "../lib/derived-news-d1-batches.mjs";
import {requireDerivedNewsWorkerPolicy,DERIVED_NEWS_TOPIC_POLICY_REVISION}
  from "../lib/derived-news-readback-policy.mjs";

const ORIGIN="https://geomacro-control-plane.daspallab202391.workers.dev";
const WEBSITE_LATEST="https://geomacro-public-finds-archive.daspallab202391.workers.dev/latest.json";
const START=Date.parse("2026-10-29T00:00:00.000Z");
const WINDOW=72*60*60_000;
const MAX_BYTES=900_000;
const CATEGORIES=["geopolitics","macro","rare_earth"];
const fail=code=>{throw Error("WEBSITE_D1_RECONCILE_"+code)};
const normalized=s=>JSON.stringify(s);
const allowedNow=now=>now instanceof Date&&Number.isFinite(now.getTime())&&now.getTime()>=START;
const bytes=s=>new TextEncoder().encode(s).length;
async function readJson(fetchImpl,url,{method="GET",authorization,body}={}){
 let response;
 try{
  response=await fetchImpl(url,{
   method,redirect:"error",cache:"no-store",
   headers:{"Accept":"application/json","Cache-Control":"no-cache",
    ...(authorization?{"Authorization":"Bearer "+authorization}:{ }),
    ...(method==="PUT"?{"Content-Type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{}),
   signal:AbortSignal.timeout(12_000),
  });
 }catch{fail("UPSTREAM_UNAVAILABLE")}
 if(response.redirected||response.status!==200||
    Number(response.headers.get("content-length")||0)>MAX_BYTES)
  fail(method==="PUT"?"WRITE_UNAVAILABLE":"READ_UNAVAILABLE");
 let raw;
 try{raw=await response.text()}catch{fail("READ_UNAVAILABLE")}
 if(bytes(raw)>MAX_BYTES)fail("BODY_TOO_LARGE");
 try{return JSON.parse(raw)}catch{fail("INVALID_JSON")}
}
function checkedLatest(doc,now){
 if(doc?.ok!==true||doc.schema!=="geomacro.website-derived-news-feed.v1"||
    doc.delivery_scope!=="free_website_only"||
    doc.retention_hours!==72||doc.retention_days!==3||
    doc.original_release_delay_minutes!==0||
    doc.scored!==false||doc.chargeable!==false||
    doc.supabase_dependency!==false||
    !Array.isArray(doc.signals)||doc.signals.length>250)
   fail("WEBSITE_CONTRACT_INVALID");
 const checked=Date.parse(doc.checked_at??"");
 if(!Number.isFinite(checked)||checked>now+60_000||
    now-checked>24*60*60_000)
   fail("WEBSITE_LATEST_STALE");
 const seen=new Set();
 for(const signal of doc.signals){
  if(!isPermanentArchiveSignal(signal,now,{allowHistorical:false})||
     !verifyDerivedStory(signal,now)||
     seen.has(signal.id))fail("WEBSITE_SIGNAL_NOT_CANONICAL_ELIGIBLE");
  seen.add(signal.id);
 }
 return doc.signals;
}
function checkedJournal(doc,now){
 const checked=Date.parse(doc?.checked_at??"");
 if(doc?.ok!==true||
    doc.schema!=="geomacro.website-derived-news-bundle.v1"||
    doc.complete!==true||doc.item_cap!==600||
    doc.delivery_scope!=="free_website_only"||
    doc.retention_hours!==72||doc.original_release_delay_minutes!==0||
    !Array.isArray(doc.signals)||doc.signals.length>600||
    doc.returned_rows!==doc.signals.length||
    !Number.isFinite(checked)||checked>now+60_000||now-checked>90_000)
   fail("CANONICAL_JOURNAL_CONTRACT_INVALID");
 const seen=new Map();
 for(const s of doc.signals){
  if(!verifyDerivedStory(s,now)||seen.has(s.id))
   fail("CANONICAL_JOURNAL_ROW_INVALID");
  seen.set(s.id,s);
 }
 return seen;
}
const countByCategory=signals=>Object.fromEntries(CATEGORIES.map(c=>[
 c,signals.filter(s=>s.category===c).length,
]));
export async function reconcileWebsiteFindsToCanonicalD1({
 fetchImpl=fetch,env=process.env,now=new Date(),
}={}){
 if(!allowedNow(now))fail("NOT_STARTED_BEFORE_2026_10_29_UTC");
 const at=now.getTime();
 // This policy handshake is identical to the existing official-source
 // publisher preflight and never bypasses deployment or quota safety.
 try{
  await requireDerivedNewsWorkerPolicy({fetchImpl,
   url:ORIGIN+"/health",expectedRevision:DERIVED_NEWS_TOPIC_POLICY_REVISION});
 }catch{fail("CANONICAL_WORKER_POLICY_UNAVAILABLE")}
 // Read the independently published public free website snapshot; never its
 // private archive, source feed or historical pre-72h partitions.
 const website=checkedLatest(await readJson(fetchImpl,WEBSITE_LATEST),at);
 // One protected-edge-bypassing bounded D1 journal read; unknown/503 holds.
 const journalUrl=ORIGIN+"/v1/public/website-derived-news-bundle";
 const before=checkedJournal(await readJson(fetchImpl,journalUrl),at);
 const missing=[];
 for(const s of website){
  const previous=before.get(s.id);
  if(previous){
   if(normalized(previous)!==normalized(s))
    fail("SAME_ID_CONTENT_CONFLICT_REQUIRES_REVIEW");
  }else missing.push(s);
 }
 if(before.size+missing.length>600)fail("BOUNDED_JOURNAL_CAP");
 const counts=countByCategory(missing);
 if(!missing.length)return Object.freeze({
  schema:"geomacro.website-d1-parity-reconcile.v1",
  same_canonical_derived_ids_verified:true,website_latest_eligible:website.length,
  missing_before:0,inserted:0,exact_d1_readback_verified:true,
  recovered_category_counts:counts,source_fetches:0,extra_source_scraping:false,
  b2_requests:0,payments:0,predge_authenticated_readback_verified:false,
 });
 const root=String(env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").trim();
 if(root.length<32)fail("EXISTING_OWNER_INGEST_TOKEN_UNAVAILABLE");
 const token=createHmac("sha256",root).update("geomacro-control-plane-v1").digest("hex");
 const {chunks}=prepareDerivedNewsBatches(missing);
 for(const chunk of chunks){
  if(!chunk.length)continue;
  const receipt=await readJson(fetchImpl,ORIGIN+"/v1/website-derived-news",{
   method:"PUT",authorization:token,
   body:{schema:"geomacro.website-derived-news-batch.v1",signals:chunk},
  });
  if(receipt?.ok!==true||
     receipt.schema!=="geomacro.website-derived-news-write-receipt.v1"||
     receipt.accepted!==chunk.length)
   fail("CANONICAL_INSERT_ACK_INVALID");
 }
 const after=checkedJournal(await readJson(fetchImpl,journalUrl),at);
 for(const s of website){
  if(!after.has(s.id)||normalized(after.get(s.id))!==normalized(s))
   fail("EXACT_WEBSITE_TO_D1_READBACK_FAILED");
 }
 return Object.freeze({
  schema:"geomacro.website-d1-parity-reconcile.v1",
  same_canonical_derived_ids_verified:true,
  website_latest_eligible:website.length,missing_before:missing.length,
  inserted:missing.length,exact_d1_readback_verified:true,
  recovered_category_counts:counts,source_fetches:0,
  b2_requests:0,payments:0,
  // The frozen authenticated partner route has an independent 500/day D1
  // budget, so only its existing separate watchdog can certify delivery.
  predge_authenticated_readback_verified:false,
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const receipt=await reconcileWebsiteFindsToCanonicalD1();
  console.log(JSON.stringify(receipt));
  console.log("::notice::CANONICAL_D1_RECONCILED_PREDGE_AUTH_REMAINS_SEPARATE");
 }catch(error){
  const m=String(error?.message??"");
  console.error("::error::"+(/^WEBSITE_D1_RECONCILE_[A-Z0-9_]+$/u.test(m)?
   m:"WEBSITE_D1_RECONCILE_UNCLASSIFIED"));
  process.exitCode=2;
 }
}
