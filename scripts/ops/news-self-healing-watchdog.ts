#!/usr/bin/env bun
/**
 * Hands-free, no-funds newsroom recovery on the EXISTING :22/:52 backstop.
 * Read-only public probe first; at most ONE guarded dispatch of an EXISTING
 * production workflow. Neither this runner nor the GH Actions API writes D1.
 */
import {planNewsSelfHeal,decideSelfHealDispatch} from "../lib/news-self-healing-policy.mjs";
import {intelligenceDisplayRejection} from "../../src/lib/intelligence-concrete-publication.ts";
import {isPermanentArchiveSignal,distinctHeadlineArchiveRows,
  buildCurrentArchiveEligibility,selectCurrentArchiveSignals}
 from "./publish-permanent-derived-news-archive.mjs";
const ROOT="https://geomacro-public-finds-archive.daspallab202391.workers.dev";
const D1="https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/website-derived-news-bundle";
const SITE="https://geomacro.live/intelligence?category=macro";
const REPO="blocknine0/geomacro";
const safe=(value,max=96)=>String(value??"UNKNOWN").replace(/[^A-Za-z0-9_.-]/gu,"_").slice(0,max);
async function publicRead(url,maxBytes=2_000_000){
 const response=await fetch(url,{
   method:"GET",redirect:"error",cache:"no-store",
   headers:{Accept:"application/json,text/html","Cache-Control":"no-cache"},
   signal:AbortSignal.timeout(9_000)
 });
 if(response.status!==200)throw Error("PUBLIC_HTTP_"+response.status);
 const raw=await response.text();
 if(raw.length>maxBytes)throw Error("PUBLIC_OVERSIZE");
 return raw;
}
/** Read current immutable public month/category shards, not merely the
 * bounded latest.json preview. Maximum 2 months × 3 categories = 6 GETs.
 * This makes ZERO D1/B2/provider source requests.
 */
async function readCurrentStaticShards(archive){
 const checked=Date.parse(archive?.latest?.checked_at);
 const months=archive?.index?.months;
 if(!Number.isFinite(checked)||!Array.isArray(months)||
    months.length>36||!months.every(m=>/^20\d{2}-(?:0[1-9]|1[0-2])$/u.test(m)))
  throw Error("NEWS_HEAL_SHARD_INDEX_INVALID");
 const possible=[...new Set([
   new Date(checked).toISOString().slice(0,7),
   new Date(checked-72*3_600_000).toISOString().slice(0,7),
 ])].filter(m=>months.includes(m));
 if(!possible.length||possible.length>2)
  throw Error("NEWS_HEAL_SHARD_MONTH_MISSING");
 const categories=["geopolitics","macro","rare_earth"];
 const requested=possible.flatMap(month=>categories.map(category=>({month,category})));
 const parts=await Promise.all(requested.map(async ({month,category})=>{
   const doc=JSON.parse(await publicRead(ROOT+"/archive/"+month+"/"+category+".json",5_000_000));
   if(doc.schema!=="geomacro.permanent-derived-news-archive-month.v1"||
      doc.month!==month||doc.category!==category||
      !Array.isArray(doc.signals)||doc.signals.length>5000||
      doc.signals.some(s=>s?.category!==category||typeof s?.id!=="string"))
    throw Error("NEWS_HEAL_SHARD_DATA_INVALID");
   return doc.signals;
 }));
 const all=parts.flat();
 const eligible=all.filter(s=>isPermanentArchiveSignal(s,checked,{allowHistorical:false}));
 const distinct=distinctHeadlineArchiveRows(eligible);
 const rebuilt=buildCurrentArchiveEligibility(all,checked,archive.latest.signals);
 const coverage=archive.coverage;
 if(rebuilt.free_displayable_findings_total!==coverage.free_displayable_findings_total||
    rebuilt.free_displayable_outside_latest_preview!==coverage.free_displayable_outside_latest_preview||
    rebuilt.eligible_outside_latest_preview!==coverage.eligible_outside_latest_preview||
    rebuilt.eligible_ids_sha256!==coverage.eligible_ids_sha256)
   throw Error("NEWS_HEAL_SHARD_COVERAGE_MISMATCH");
 const rebuiltPreview=selectCurrentArchiveSignals(eligible,250);
 if(rebuiltPreview.length!==archive.latest.signals.length||
    rebuiltPreview.some((s,i)=>s.id!==archive.latest.signals[i]?.id||
      s.published_at!==archive.latest.signals[i]?.published_at))
   throw Error("NEWS_HEAL_SHARD_PREVIEW_MISMATCH");
 return distinct;
}
async function githubRequest(path,token,init={}){
 const response=await fetch("https://api.github.com/repos/"+REPO+path,{
   ...init,headers:{
    Accept:"application/vnd.github+json",
    Authorization:"Bearer "+token,
    "X-GitHub-Api-Version":"2022-11-28",
    ...(init.body?{"Content-Type":"application/json"}:{})
   },redirect:"error",cache:"no-store",signal:AbortSignal.timeout(12_000)
 });
 return response;
}
async function run(){
 const now=Date.now();
 const researchAllowed=process.env.GEOMACRO_RECOVERY_RESEARCH_ADMITTED==="true" &&
   process.env.GEOMACRO_RECOVERY_QUOTA_JOB_OK==="true";
 let archive=null,archiveAvailable=false;
 try{
  const [index,latest,coverage,daily]=await Promise.all([
   publicRead(ROOT+"/index.json",256_000).then(JSON.parse),
   publicRead(ROOT+"/latest.json").then(JSON.parse),
   publicRead(ROOT+"/coverage-72h.json",500_000).then(JSON.parse),
   publicRead(ROOT+"/daily-highlights.json",500_000).then(JSON.parse)
  ]);
  archive={index,latest,coverage,daily};archiveAvailable=true;
 }catch{console.warn("::warning::NEWS_HEAL_PUBLIC_ARCHIVE_READ_UNAVAILABLE")}
 let d1=null,d1Available=false,websiteOk=null,archiveRows=null;
 if(archiveAvailable&&researchAllowed){
  if(Number(archive?.coverage?.free_displayable_outside_latest_preview)>0){
   try{archiveRows=await readCurrentStaticShards(archive);}
   catch{console.warn("::warning::NEWS_HEAL_STATIC_SHARD_READBACK_UNAVAILABLE")}
  }
  // At most ONE public D1 bundle request per admitted backstop tick; 503/429
  // cannot become a retry storm or an expensive paginated fallback.
  try{d1=JSON.parse(await publicRead(D1,4_000_000));d1Available=true}
  catch{console.warn("::warning::NEWS_HEAL_PUBLIC_D1_UNAVAILABLE")}
  try{
   const site=await publicRead(SITE,3_000_000);
   websiteOk=site.includes("What changed in the world")&&site.includes("GEOMACRO");
  }catch{websiteOk=false}
 }
 const decision=planNewsSelfHeal({
  archive,archiveAvailable,archiveRows,d1,d1Available,websiteOk,
  now,researchAllowed,
  classifyDisplay:intelligenceDisplayRejection,
  isArchiveEligible:isPermanentArchiveSignal
 });
 // Source-only collection has its own quota-gated actual-job watchdog on this
 // same backstop; never dispatch it again from static publication recovery.
 const receipt={
  schema:"geomacro.automatic-news-self-healing.v1",
  checked_at:new Date(now).toISOString(),
  stage_status:decision.status,reason:decision.reason,
  detected_by:"existing_22_52_cadence",
  repair_workflow:decision.workflow??null,
  missing_publishable_by_category:decision.counts??null,
  bounded_repair_requested:false,repair_verified:false,
  provider_quota_bypass:false,
  public_journal_reads:researchAllowed&&archiveAvailable?1:0,
  private_d1_reads:0,private_d1_writes:0,
  source_fetches:0,payments:0,predge_modified:false,
  raw_news_logged:false
 };
 if(decision.status!=="RECOVER"){
  console.log(JSON.stringify(receipt));
  if(decision.status==="BLOCKED")process.exitCode=2;
  return;
 }
 const token=process.env.GITHUB_TOKEN??"";
 if(token.length<16){
  console.error("::error::NEWS_HEAL_GITHUB_ACTIONS_TOKEN_UNAVAILABLE");
  process.exitCode=2;return;
 }
 let runs;
 try{
  const response=await githubRequest("/actions/workflows/"+
    encodeURIComponent(decision.workflow)+"/runs?branch=main&per_page=40",token);
  if(response.status!==200)throw Error("READ_STATUS_"+response.status);
  const data=await response.json();
  if(!Array.isArray(data.workflow_runs)||data.workflow_runs.length>40)
   throw Error("RUN_HISTORY_INVALID");
  runs=data.workflow_runs;
 }catch{
  console.error("::error::NEWS_HEAL_WORKFLOW_HISTORY_UNAVAILABLE");
  process.exitCode=2;return;
 }
 const gate=decideSelfHealDispatch(decision,runs,now);
 if(!gate.dispatch){
  console.warn("::warning::NEWS_HEAL_"+safe(gate.reason));
  console.log(JSON.stringify({...receipt,repair_gate:gate.reason}));
  return;
 }
 const response=await githubRequest("/actions/workflows/"+
   encodeURIComponent(decision.workflow)+"/dispatches",token,{
     method:"POST",body:JSON.stringify({ref:"main"})
   });
 if(response.status!==204){
  console.error("::error::NEWS_HEAL_DISPATCH_REJECTED_"+safe(response.status));
  process.exitCode=2;return;
 }
 console.log(JSON.stringify({
  ...receipt,bounded_repair_requested:true,
  repair_gate:gate.reason,
  verification_on_next_existing_cadence:true,
  // GitHub 204 means a request was accepted, NOT that publication succeeded.
  repair_verified:false
 }));
}
run().catch(()=>{
 console.error("::error::NEWS_HEAL_UNCLASSIFIED_RUNTIME_FAILURE");
 process.exitCode=2;
});
