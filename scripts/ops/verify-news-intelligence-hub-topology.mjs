#!/usr/bin/env node
/** Zero-network architecture drift gate for the existing 5 functional groups. */
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
const ROOT=fileURLToPath(new URL("../../",import.meta.url));
const FILE="config/news-intelligence-hub.json";
const KEYS=["collector","processor","publisher","distribution","health_recovery"];
const CATS=["geopolitics","macro","rare_earth"];
const REQUIRED=[
"workers/control-plane/src/website-derived-intelligence.mjs",
"scripts/ops/verify-derived-news-public-readback.mjs",
"scripts/ops/verify-shared-derived-news-live.mjs",
"scripts/ops/verify-production-observed-195x3.mjs"];
const invalidPath=p=>typeof p!=="string"||!p.split("/").every(seg=>/^[a-zA-Z0-9_.-]+$/u.test(seg)&&seg!==".."&&seg!==".");
export function validateNewsHubTopology(read=p=>readFileSync(resolve(ROOT,p),"utf8")){
 const doc=JSON.parse(read(FILE));
 if(doc?.schema!=="geomacro.news-intelligence-hub-topology.v1"||
   JSON.stringify(doc.domains)!==JSON.stringify(CATS)||
   !Array.isArray(doc.groups)||doc.groups.length!==5||
   JSON.stringify(doc.groups.map(g=>g.key))!==JSON.stringify(KEYS)||
   !Array.isArray(doc.contracts)||doc.contracts.length!==REQUIRED.length)
   throw Error("NEWS_HUB_MANIFEST_INVALID");
 const invariants=doc.invariants;
 if(!invariants||invariants.first_seen_immutable!==true||
   invariants.source_native_clock_required!==true||
   invariants.private_unverified_lead_must_not_auto_promote!==true||
   Object.entries(invariants).some(([k,v])=>k!=="first_seen_immutable"&&
     k!=="source_native_clock_required"&&k!=="private_unverified_lead_must_not_auto_promote"&&v!==false))
   throw Error("NEWS_HUB_SAFETY_DRIFT");
 const unique=new Set();
 for(const group of doc.groups){
   if(!Array.isArray(group.workflows)||group.workflows.length===0)throw Error("NEWS_HUB_GROUP_EMPTY");
   for(const x of group.workflows){
     if(invalidPath(x?.path)||!x.path.startsWith(".github/workflows/")||
       !Array.isArray(x.markers)||x.markers.length===0)throw Error("NEWS_HUB_PATH_INVALID");
     unique.add(x.path);
     const content=read(x.path);
     for(const token of x.markers)
       if(typeof token!=="string"||!content.includes(token))throw Error("NEWS_HUB_WORKFLOW_DRIFT");
   }
 }
 const names=new Set();
 for(const x of doc.contracts){
   if(invalidPath(x?.path)||!REQUIRED.includes(x.path)||names.has(x.path)||
     !Array.isArray(x.markers)||x.markers.length===0)throw Error("NEWS_HUB_CONTRACT_INVALID");
   names.add(x.path);
   const content=read(x.path);
   for(const token of x.markers)if(typeof token!=="string"||!content.includes(token))
     throw Error("NEWS_HUB_SINK_DRIFT");
 }
 if(names.size!==REQUIRED.length)throw Error("NEWS_HUB_SINK_MISSING");
 return Object.freeze({schema:"geomacro.news-hub-topology-check.v1",static_contract_valid:true,
  groups:KEYS,unique_existing_or_grouped_workflows:unique.size,canonical_sink_contracts:names.size,
  actual_live_collection_verified:false,source_coverage_195x3_verified:false,
  per_country_news_guaranteed:false,paid_publication_authorized:false,network_requests:0,d1_writes:0});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(validateNewsHubTopology()));}
 catch(err){console.error(err instanceof Error&&err.message.startsWith("NEWS_HUB_")?err.message:"NEWS_HUB_STATIC_CHECK_FAILED");process.exitCode=1;}
}
