#!/usr/bin/env node
/**
 * Hourly no-D1-SQL launch receipt for #1827.
 * Records real Cloudflare account counters, one anonymous public response,
 * deployed-source identity and a bounded encrypted-queue artifact inventory.
 * Never treats GitHub green or an unknown receipt as a verified D1 write.
 */
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {readCloudflareD1AccountQuota} from "./audit-d1-account-daily-quota-readonly.mjs";

export const SCHEMA="geomacro.d1-launch-hourly-receipt.v1";
const ROOT="https://geomacro-control-plane.daspallab202391.workers.dev";
const MAX_BODY=1_000_000;
const asError=e=>typeof e?.message==="string"&&/^[A-Z0-9_]+$/.test(e.message)?
  e.message:"UNKNOWN_PROVIDER_OR_NETWORK_FAILURE";
async function publicProbe(fetchImpl){
 try{
  const r=await fetchImpl(ROOT+"/v1/public/derived-structural-72h",{
   method:"GET",redirect:"error",
   headers:{"Accept":"application/json"},
   signal:AbortSignal.timeout(12_000),
  });
  if(Number(r.headers.get("content-length")??0)>MAX_BODY)
   throw Error("PUBLIC_BUNDLE_OVERSIZE");
  const body=await r.text();
  if(body.length>MAX_BODY)throw Error("PUBLIC_BUNDLE_OVERSIZE");
  const doc=JSON.parse(body);
  const verified=r.status===200&&!r.redirected&&
    doc?.ok===true&&doc.schema==="geomacro.derived-news-structural-feed.v1"&&
    doc.projection==="source_neutral"&&doc.chargeable===false;
  return {verified,http_status:r.status,
    offload:r.headers.get("X-GeoMacro-Public-Offload")??"none",
    source_neutral_contract_verified:verified};
 }catch(e){return {verified:false,http_status:null,error:asError(e)}}
}
async function deployedShaProbe(fetchImpl,expected){
 try{
  const r=await fetchImpl(ROOT+"/health",{method:"GET",redirect:"error",
   headers:{"Cache-Control":"no-cache"},signal:AbortSignal.timeout(10_000)});
  if(r.status!==200)throw Error("PRODUCTION_HEALTH_UNAVAILABLE");
  const text=await r.text();
  if(text.length>20_000)throw Error("PRODUCTION_HEALTH_OVERSIZE");
  const doc=JSON.parse(text);
  return {exact_main_sha_verified:/^[a-f0-9]{40}$/.test(expected)&&
    doc.deployed_source_sha===expected,health_http_status:r.status};
 }catch(e){return {exact_main_sha_verified:false,error:asError(e)}}
}
async function backlogProbe(fetchImpl,env,now){
 const token=env.GH_TOKEN??env.GITHUB_TOKEN;
 if(typeof token!=="string"||token.length<10)
  return {verified:false,error:"BACKLOG_GITHUB_READ_TOKEN_UNAVAILABLE"};
 try{
  const all=[];
  for(let page=1;page<=3;page++){
   const u="https://api.github.com/repos/blocknine0/geomacro/actions/artifacts?"+
    "name=geomacro-encrypted-private-osint-held&per_page=100&page="+page;
   const r=await fetchImpl(u,{headers:{Authorization:"Bearer "+token,
    Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"},
    signal:AbortSignal.timeout(12_000),redirect:"error"});
   if(!r.ok)throw Error("BACKLOG_INDEX_HTTP_UNAVAILABLE");
   const doc=await r.json();
   if(!Number.isSafeInteger(doc.total_count)||doc.total_count>300||
     !Array.isArray(doc.artifacts)||doc.artifacts.length>100)
    throw Error("BACKLOG_INDEX_UNBOUNDED");
   all.push(...doc.artifacts);
   if(all.length>=doc.total_count||doc.artifacts.length<100)break;
   if(page===3)throw Error("BACKLOG_INDEX_TRUNCATED");
  }
  const active=all.filter(x=>x?.expired===false&&
    x.name==="geomacro-encrypted-private-osint-held"&&
    x.workflow_run?.head_branch==="main"&&
    Number.isFinite(Date.parse(x.created_at)));
  const pending=active.filter(x=>now-Date.parse(x.created_at)<=25*3_600_000);
  const aged=active.length-pending.length;
  return {verified:true,pending_artifacts:pending.length,
    aged_out_artifacts:aged,inventory_count:all.length};
 }catch(e){return {verified:false,error:asError(e)}}
}
export async function observeD1LaunchHour({env=process.env,fetchImpl=fetch,
 now=new Date()}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))
  throw Error("D1_LAUNCH_OBSERVER_CLOCK_INVALID");
 let provider;
 try{
  const x=await readCloudflareD1AccountQuota({env,fetchImpl,now});
  provider={verified:true,day_utc:x.day_utc,rows_read:x.observed_rows_read,
    rows_written:x.observed_rows_written,remaining_rows_read:x.remaining_rows_read,
    remaining_rows_written:x.remaining_rows_written};
 }catch(e){provider={verified:false,error:asError(e)}}
 const [publicStatus,deploy,backlog]=await Promise.all([
  publicProbe(fetchImpl),
  deployedShaProbe(fetchImpl,String(env.GITHUB_SHA??"")),
  backlogProbe(fetchImpl,env,now.getTime())
 ]);
 return Object.freeze({
  schema:SCHEMA,observed_at_utc:now.toISOString(),provider,
  public:publicStatus,deploy,backlog,
  critical:{independent_d1_readback_verified:false,
    reason:"AUTHENTICATED_SOURCE_RECEIPT_REQUIRED_NOT_GITHUB_GREEN"},
  recovery:{verified_replayed_items:null,
    reason:"VERIFIED_REPLAY_RECEIPT_NOT_AVAILABLE"},
  r2_snapshot_activated_by_observer:false,
  predge_modified:false,customer_paid_calls:0,
  d1_sql_queries_by_observer:0,github_actions_proof_not_ingestion_proof:true
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const path="artifacts/d1-launch-hourly/receipt.json";
 try{
  const receipt=await observeD1LaunchHour();
  mkdirSync("artifacts/d1-launch-hourly",{recursive:true});
  writeFileSync(path,JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
  // Output only sanitized numeric/provider states; never a source payload.
  console.log(JSON.stringify({schema:receipt.schema,observed_at_utc:receipt.observed_at_utc,
   provider:receipt.provider,public:receipt.public,deploy:receipt.deploy,
   backlog:receipt.backlog,acceptance:"PENDING_AUTHENTICATED_CRITICAL_AND_REPLAY_PROOF"}));
 }catch{
  console.error("D1_LAUNCH_OBSERVER_UNVERIFIED");process.exitCode=2;
 }
}
