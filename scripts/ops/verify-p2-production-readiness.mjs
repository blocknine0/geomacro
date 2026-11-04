#!/usr/bin/env node
/**
 * Main-SHA exact P2 outside-in production acceptance: never tests on mocks.
 * No synthetic news on public website, no B2 quota bypass or paid delivery.
 * The production workflow fails if any required deployment/feed proof is red.
 */
import {writeFileSync,mkdirSync} from "node:fs";
import {deriveControlPlaneRootToken}
 from "./derive-control-plane-root-token.mjs";
const SITE="https://geomacro.live",CONTROL=
 "https://geomacro-control-plane.daspallab202391.workers.dev";
const REG=/^[0-9a-f]{40}$/u;
const categories=["geopolitics","macro","rare_earth"];
const expected=String(process.env.GITHUB_SHA??"");
const main=process.env.GITHUB_REPOSITORY==="blocknine0/geomacro"&&
 process.env.GITHUB_REF==="refs/heads/main"&&REG.test(expected);
if(!main)throw Error("P2_EXACT_MAIN_REQUIRED");
const token=deriveControlPlaneRootToken(
 process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN);
async function limited(url,headers={},bytes=1_500_000){
 const r=await fetch(url,{method:"GET",redirect:"error",cache:"no-store",
  headers:{Accept:"application/json",...headers},
  signal:AbortSignal.timeout(12_000)});
 const content=await r.text();
 if(content.length>bytes)throw Error("P2_LIVE_PROOF_OVERSIZE");
 return {status:r.status,headers:r.headers,data:JSON.parse(content)};
}
const receipt={schema:"geomacro.p2-production-readiness.v1",
 expected_main_sha:expected,checked_at:new Date().toISOString(),
 website_sha_parity:false,control_plane_sha_parity:false,
 categories:Object.fromEntries(categories.map(c=>[c,{d1_live:false,rows:null}])),
 gro:{d1_readback:false,verified_15m_ratio:null,
  archived_eligible:null,target_90pct:false},
 edge:{intelligence:null,global_risk:null},
 synthetic_d1_b2_site_write_readback:false,
 source_calls_in_this_job:0,b2_requests:0,b2_puts:0,
 no_funds:true,predge_changes:0,
 production_accepted:false,errors:[]};
async function check(){
 try{
  const r=await limited(CONTROL+"/health");
  receipt.control_plane_sha_parity=r.status===200&&
   r.data?.ok===true&&r.data.deployed_source_sha===expected;
  if(!receipt.control_plane_sha_parity)
   receipt.errors.push("D1_WORKER_MAIN_SHA_NOT_DEPLOYED");
 }catch{receipt.errors.push("D1_WORKER_HEALTH_UNAVAILABLE");}
 try{
  const r=await limited(SITE+"/.well-known/geomacro-build.json");
  receipt.website_sha_parity=r.status===200&&
    r.data?.schema_version==="geomacro.deployment-build.v1"&&
    r.data?.canonical_repository==="blocknine0/geomacro"&&
    r.data?.canonical_main_sha===expected;
  if(!receipt.website_sha_parity)
   receipt.errors.push("WEBSITE_MAIN_SHA_NOT_PUBLISHED");
 }catch{receipt.errors.push("WEBSITE_BUILD_MARKER_UNAVAILABLE");}
 for(const category of categories){
  try{
   const r=await limited(CONTROL+"/api/v1/feed/"+category);
   const checked=Date.parse(String(r.data?.checked_at??""));
   const good=r.status===200&&
    r.headers.get("x-geomacro-data-origin")==="canonical-d1"&&
    r.data?.ok===true&&r.data?.schema==="geomacro.canonical-category-edge-feed.v1"&&
    r.data?.category===category&&r.data?.gro_verified_publication===false&&
    r.data?.scored===false&&
    Array.isArray(r.data.signals)&&r.data.signals.length<=80&&
    Number.isFinite(checked)&&checked<=Date.now()+60000&&
    Date.now()-checked<=120000;
   receipt.categories[category]={d1_live:good,
    rows:good?r.data.signals.length:null};
   if(!good)receipt.errors.push("CANONICAL_FEED_INVALID_"+category);
  }catch{receipt.errors.push("CANONICAL_FEED_UNAVAILABLE_"+category);}
 }
 try{
  const r=await limited(CONTROL+"/v1/internal/gro-evidence/status",
   {Authorization:"Bearer "+token},32768);
  const a=r.data?.acceptance;
  const good=r.status===200&&r.data?.ok===true&&
   r.data?.schema==="geomacro.gro-evidence-private-health.v1"&&
   typeof a?.verified_90pct_target_met==="boolean";
  receipt.gro={d1_readback:good,
   archived_eligible:good?a.eligible_archived_matured_15m:null,
   verified_15m_ratio:good?a.verified_15m_ratio:null,
   target_90pct:good?a.verified_90pct_target_met:false};
  if(!good)receipt.errors.push("GRO_EVIDENCE_D1_UNAVAILABLE");
  else if(a.eligible_archived_matured_15m>0&&!a.verified_90pct_target_met)
   receipt.errors.push("GRO_VERIFIED_15M_SLO_NOT_MET");
 }catch{receipt.errors.push("GRO_EVIDENCE_STATUS_UNAVAILABLE");}
 const edges=[
  ["intelligence","https://geomacro-intelligence.daspallab202391.workers.dev/intelligence"],
  ["global_risk","https://geomacro-global-risk.daspallab202391.workers.dev/global-risk"],
 ];
 for(const [key,url] of edges){
  try{
   const res=await fetch(url,{method:"GET",redirect:"error",
    headers:{Accept:"application/json"},signal:AbortSignal.timeout(12000)});
   const status=res.status;
   await res.body?.cancel();
   receipt.edge[key]=status;
   if(status!==200)receipt.errors.push("VERIFIED_EDGE_HTTP_"+status+"_"+key);
  }catch{receipt.errors.push("VERIFIED_EDGE_UNAVAILABLE_"+key);}
 }
 receipt.production_accepted=receipt.errors.length===0&&
  receipt.website_sha_parity&&receipt.control_plane_sha_parity&&
  Object.values(receipt.categories).every(c=>c.d1_live)&&
  receipt.gro.d1_readback&&
  receipt.edge.intelligence===200&&receipt.edge.global_risk===200;
}
await check();
mkdirSync("artifacts/p2-production",{recursive:true,mode:0o700});
writeFileSync("artifacts/p2-production/latest.json",
 JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify(receipt));
if(!receipt.production_accepted)process.exitCode=2;
