/**
 * Phase 2I-B: reuse existing Phase 2H private D1 raw intake from the admitted
 * five-minute source collector. Never introduces a source, table, B2 call,
 * rights grant, invoice, or governor exception. All counts are per-run only.
 */
import {buildPhase2hPrivateRawRecords,postPhase2hPrivateRawRecords}
 from "./phase2h-raw-original-records.mjs";

const CATEGORIES=["geopolitics","macro","rare_earth"];
const INDEX_ONLY=/^(?:google_|gdelt|gnews|newsapi|search_)/iu;
const count=records=>Object.fromEntries(CATEGORIES.map(category=>[
 category,records.filter(x=>x.category===category).length,
]));
const validBudget=x=>Number.isSafeInteger(x)&&[3,5,10,25,50].includes(x);
const validCadence=x=>Number.isSafeInteger(x)&&[5,10,15,30,60].includes(x);

export function planPhase2iFastlanePrivateStage(candidates,{
 now=new Date(),maxRows,intervalMinutes,derive
}={}){
 if(!Array.isArray(candidates)||!(now instanceof Date)||
    !Number.isFinite(now.getTime())||!validBudget(maxRows)||
    !validCadence(intervalMinutes)||typeof derive!=="function")
  throw Error("PHASE2IB_FASTLANE_STAGE_ARGUMENTS_INVALID");
 // The three existing pinned feeds and their official Macro sharing provide
 // native publisher observations. Aggregator/search leads are discovery only.
 const firstParty=candidates.filter(c=>c&&typeof c.sourceId==="string"&&
    !INDEX_ONLY.test(c.sourceId));
 const excludedIndex=candidates.length-firstParty.length;
 const plan=buildPhase2hPrivateRawRecords(firstParty,{now,derive});
 const recent=plan.records.filter(r=>{
  const t=Date.parse(r.original.original_published_at);
  return Number.isFinite(t)&&t<=now.getTime()+60_000&&
    now.getTime()-t<=72*3600_000;
 }).sort((a,b)=>a.category.localeCompare(b.category)||
  b.original.original_published_at.localeCompare(a.original.original_published_at)||
  a.record_id.localeCompare(b.record_id));
 // Bounded deterministic rotation ensures a stable >maxRows candidate set
 // does not repeatedly spend every tick on its first five old IDs. No D1
 // existence guesses: the protected Phase 2H endpoint alone counts duplicates.
 const start=recent.length
  ?(Math.floor(now.getTime()/(intervalMinutes*60_000))*maxRows)%recent.length:0;
 const selected=Array.from({length:Math.min(maxRows,recent.length)},
  (_,i)=>recent[(start+i)%recent.length]);
 return Object.freeze({
  records:selected,observed_unique:recent.length,selected_count:selected.length,
  deferred_count:recent.length-selected.length,
  invalid_or_old:plan.discarded_invalid+(plan.records.length-recent.length),
  index_only_excluded:excludedIndex,
  observed_by_category:count(recent),selected_by_category:count(selected),
  rights_verified:false,body_fabricated:false,
 });
}

export async function stagePhase2iFastlanePrivateOriginals({
 candidates,now=new Date(),maxRows,intervalMinutes,derive,
 env=process.env,controlPlaneRoot,token,fetchImpl=fetch,
 post=postPhase2hPrivateRawRecords
}={}){
 // Only the existing admitted main-run source slot may spend private D1 quota.
 // A PR or an unadmitted workflow is diagnostic only and never contacts D1.
 if(env.GITHUB_ACTIONS!=="true"||
    env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    env.GITHUB_REF!=="refs/heads/main"||
    !["0","1"].includes(env.GEOMACRO_SOURCE_INTAKE_ONLY)||
    !validBudget(maxRows)||!validCadence(intervalMinutes))
   return {schema:"geomacro.phase2ib.fastlane-private-raw-stage.v1",
    status:"NOT_ADMITTED",observed_unique:null,d1_inserted:null,
    d1_unchanged:null,b2_verified:false};
 const plan=planPhase2iFastlanePrivateStage(candidates,{
  now,maxRows,intervalMinutes,derive,
 });
 if(plan.selected_count===0)return {
  schema:"geomacro.phase2ib.fastlane-private-raw-stage.v1",
  status:"NO_ELIGIBLE_NATIVE_ORIGINAL",...plan,records:undefined,
  d1_inserted:0,d1_unchanged:0,d1_readback_verified:false,
  b2_verified:false,payments:0,
 };
 const receipt=await post({records:plan.records,controlPlaneRoot,token,fetchImpl});
 if(receipt?.readback_verified!==true||
    !Number.isSafeInteger(receipt.stored)||!Number.isSafeInteger(receipt.duplicate)||
    receipt.stored<0||receipt.duplicate<0||
    receipt.stored+receipt.duplicate!==plan.selected_count)
  throw Error("PHASE2IB_FASTLANE_RAW_D1_RECEIPT_INVALID");
 const {records:privateRecords,...safe}=plan;
 return {schema:"geomacro.phase2ib.fastlane-private-raw-stage.v1",
  status:"CANONICAL_D1_EXACT_READBACK_VERIFIED",
  ...safe,d1_inserted:receipt.stored,d1_unchanged:receipt.duplicate,
  d1_readback_verified:true,b2_verified:false,
  event_country_verified:false,commercial_rights_verified:false,
  original_body_collected:false,payments:0,
 };
}
