#!/usr/bin/env node
/**
 * Cloudflare-free-tier static archive freshness maintenance:
 * compare the D1-INDEPENDENT public latest snapshot against the one rebuilt
 * from immutable historical archive shards at the real clock.
 *
 * Only scheduled no-funds refreshes may skip an identical deployment.
 * If a remote status is unavailable or malformed, deploy the strictly
 * source-validated local static asset; never trust remote data as evidence.
 * No D1, B2, R2, KV, upstream publisher, payment or PREDGE requests.
 */
import {readFileSync,appendFileSync} from "node:fs";
import {resolve,dirname,join} from "node:path";
import {pathToFileURL} from "node:url";

const BASE="https://geomacro-public-finds-archive.daspallab202391.workers.dev";
const URL=BASE+"/latest.json";
const COVERAGE_URL=BASE+"/coverage-72h.json";
const INDEX_URL=BASE+"/index.json";
const MAX_BYTES=1_500_000;
const CATEGORIES=["geopolitics","macro","rare_earth"];
const validTime=s=>typeof s==="string"&&Number.isFinite(Date.parse(s));
function expectedShape(doc){
 return doc?.ok===true&&doc?.schema==="geomacro.website-derived-news-feed.v1"&&
  doc?.delivery_scope==="free_website_only"&&doc?.chargeable===false&&
  doc?.scored===false&&doc?.supabase_dependency===false&&
  doc?.retention_days===3&&doc?.retention_hours===72&&
  doc?.original_release_delay_minutes===0&&validTime(doc.checked_at)&&
  Array.isArray(doc.signals)&&doc.signals.length<=250;
}
function fingerprints(doc){
 return {
  schema:doc.schema,delivery_scope:doc.delivery_scope,
  retention_days:doc.retention_days,retention_hours:doc.retention_hours,
  chargeable:doc.chargeable,scored:doc.scored,
  supabase_dependency:doc.supabase_dependency,
  original_release_delay_minutes:doc.original_release_delay_minutes,
  signals:doc.signals,
 };
}
export function shouldDeployFreshPublicArchive(expected,remote,now=Date.now()){
 if(!Number.isFinite(now)||!expectedShape(expected))
  throw Error("PUBLIC_FINDS_EXPECTED_BUNDLE_INVALID");
 if(Date.parse(expected.checked_at)>now+60_000 ||
    now-Date.parse(expected.checked_at)>10*60_000)
  throw Error("PUBLIC_FINDS_EXPECTED_BUILD_CLOCK_INVALID");
 if(!remote||!expectedShape(remote))return {
  deploy:true,reason:"PUBLIC_READBACK_MISSING_OR_UNTRUSTED"};
 const liveTime=Date.parse(remote.checked_at);
 if(liveTime>now+60_000)return {
  deploy:true,reason:"PUBLIC_READBACK_FUTURE_CLOCK_INVALID"};
 const exact=JSON.stringify(fingerprints(expected))===
  JSON.stringify(fingerprints(remote));
 return {deploy:!exact,
  reason:exact?"ALREADY_IDENTICAL_NATIVE_CLOCK_VALIDATED_FEED":
    "PUBLIC_FEED_ROWS_OR_SAFETY_CONTRACT_DIFFERS"};
}

// A 250-row rolling preview is NOT the full 72h archive. A scheduled no-op
// must also match all untruncated eligibility statistics/ID digest and the
// append-only index, otherwise a newly archived old item could be omitted.
const withoutClock=doc=>{
 const {checked_at,...data}=doc;
 return JSON.stringify(data);
};
export function shouldDeployFullArchiveSnapshot(expectedCoverage,liveCoverage,expectedIndex,liveIndex,now=Date.now()){
 if(!Number.isFinite(now)||
    expectedCoverage?.schema!=="geomacro.free-derived-archive-eligibility.v1"||
    expectedCoverage.d1_reads!==0||typeof expectedCoverage.eligible_ids_sha256!=="string"||
    !/^[a-f0-9]{64}$/.test(expectedCoverage.eligible_ids_sha256)||
    !Number.isFinite(Date.parse(expectedCoverage.checked_at))||
    Date.parse(expectedCoverage.checked_at)>now+60_000||
    now-Date.parse(expectedCoverage.checked_at)>10*60_000)
  throw Error("PUBLIC_FINDS_EXPECTED_COVERAGE_INVALID");
 const at=Date.parse(liveCoverage?.checked_at??"");
 if(!Number.isFinite(at)||at>now+60_000||now-at>6*60*60_000||
    liveCoverage?.schema!==expectedCoverage.schema)
  return {deploy:true,reason:"PUBLIC_ARCHIVE_COVERAGE_STALE_OR_MISSING"};
 if(withoutClock(liveCoverage)!==withoutClock(expectedCoverage))
  return {deploy:true,reason:"PUBLIC_ARCHIVE_FULL_COVERAGE_CHANGED"};
 if(JSON.stringify(liveIndex)!==JSON.stringify(expectedIndex))
  return {deploy:true,reason:"PUBLIC_ARCHIVE_IMMUTABLE_INDEX_CHANGED"};
 return {deploy:false,reason:"FULL_ARCHIVE_AND_NATIVE_ELIGIBILITY_IDENTICAL"};
}
export async function decidePublicArchiveDeployment({
 localPath="workers/public-finds-archive/assets/latest.json",
 fetchImpl=fetch,now=Date.now(),env=process.env,
}={}){
 const source=readFileSync(resolve(localPath),"utf8");
 if(Buffer.byteLength(source)>MAX_BYTES)
  throw Error("PUBLIC_FINDS_LOCAL_SNAPSHOT_OVERSIZE");
 let expected;
 try{expected=JSON.parse(source)}
 catch{throw Error("PUBLIC_FINDS_LOCAL_JSON_INVALID")}
 const assetsDir=dirname(resolve(localPath));
 let expectedCoverage,expectedIndex;
 try{
  expectedCoverage=JSON.parse(readFileSync(join(assetsDir,"coverage-72h.json"),"utf8"));
  expectedIndex=JSON.parse(readFileSync(join(assetsDir,"index.json"),"utf8"));
 }catch{throw Error("PUBLIC_FINDS_LOCAL_FULL_ARCHIVE_MISSING")}
 let result;
 try{
  const response=await fetchImpl(URL+"?freshness="+Math.floor(now),{
   method:"GET",redirect:"error",cache:"no-store",
   headers:{Accept:"application/json","Cache-Control":"no-cache"},
   signal:AbortSignal.timeout(9000),
  });
  if(response?.status!==200||response.redirected||
     Number(response.headers?.get?.("content-length")||0)>MAX_BYTES)
   throw Error("PUBLIC_ARCHIVE_REMOTE_UNAVAILABLE");
  const text=await response.text();
  if(Buffer.byteLength(text)>MAX_BYTES)
   throw Error("PUBLIC_ARCHIVE_REMOTE_OVERSIZE");
  result=shouldDeployFreshPublicArchive(expected,JSON.parse(text),now);
  if(!result.deploy){
   // Only when the preview matches: two cheap STATIC Worker reads catch
   // changes outside the 250-row preview. No D1 or PREDGE quota is spent.
   const check=async(url,cap)=>{
    const response=await fetchImpl(url+"?freshness="+Math.floor(now),{
     method:"GET",redirect:"error",cache:"no-store",
     headers:{Accept:"application/json","Cache-Control":"no-cache"},
     signal:AbortSignal.timeout(9000),
    });
    if(response?.status!==200||response.redirected||
       Number(response.headers?.get("content-length")||0)>cap)
     throw Error("PUBLIC_ARCHIVE_AUXILIARY_READ_UNAVAILABLE");
    const payload=await response.text();
    if(Buffer.byteLength(payload)>cap)
     throw Error("PUBLIC_ARCHIVE_AUXILIARY_OVERSIZE");
    return JSON.parse(payload);
   };
   result=shouldDeployFullArchiveSnapshot(expectedCoverage,
    await check(COVERAGE_URL,1_500_000),expectedIndex,
    await check(INDEX_URL,256_000),now);
  }
 }catch(error){
  if(!expectedShape(expected)||Date.parse(expected.checked_at)>now+60_000||
     now-Date.parse(expected.checked_at)>10*60_000)
   throw Error("PUBLIC_FINDS_EXPECTED_BUILD_CLOCK_INVALID");
  result={deploy:true,reason:"PUBLIC_ARCHIVE_REMOTE_READ_UNAVAILABLE"};
 }
 const counts=Object.fromEntries(CATEGORIES.map(category=>[
  category,expected.signals.filter(x=>x.category===category).length]));
 const receipt={
  schema:"geomacro.public-finds-no-d1-freshness-deploy-decision.v1",
  deploy_required:result.deploy,reason:result.reason,
  expected_source_records:expected.signals.length,
  expected_categories:counts,
  source_native_72h_not_extended:true,append_only_historical_shards_preserved:true,
  b2_requests:0,d1_queries:0,r2_requests:0,kv_requests:0,payments:0,
  predge_touched:false,source_details_logged:false,
 };
 if(env.GITHUB_OUTPUT)appendFileSync(env.GITHUB_OUTPUT,
  "deploy="+(result.deploy?"true":"false")+"\n");
 console.log(JSON.stringify(receipt));
 return receipt;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 decidePublicArchiveDeployment().catch(()=>{
  console.error("PUBLIC_FINDS_STATIC_FRESHNESS_DECISION_FAILED_CLOSED");
  process.exitCode=2;
 });
