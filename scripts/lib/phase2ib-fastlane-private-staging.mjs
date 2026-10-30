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
 // A bounded round-robin gives each non-empty original-source category
 // an opportunity in every small admitted tick. Rotate WITHIN each lane so
 // old identical IDs cannot consume the same first five slots forever.
 // No D1 existence guesses: Phase 2H alone proves same-ID duplicates.
 const cycle=Math.floor(now.getTime()/(intervalMinutes*60_000));
 const lanes=CATEGORIES.map(category=>recent.filter(r=>r.category===category));
 const taken=lanes.map(()=>0);
 const offsets=lanes.map(rows=>rows.length
  ?(cycle*Math.ceil(maxRows/CATEGORIES.length))%rows.length:0);
 const selected=[];
 while(selected.length<maxRows&&selected.length<recent.length){
  let progress=false;
  for(let i=0;i<lanes.length&&selected.length<maxRows;i++){
   if(taken[i]>=lanes[i].length)continue;
   selected.push(lanes[i][(offsets[i]+taken[i])%lanes[i].length]);
   taken[i]++;progress=true;
  }
  if(!progress)break;
 }
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
 // The existing Phase 2H D1 endpoint rejects the ENTIRE batch before any
 // insert if one immutable ID has a true original-content collision.
 // During only a 3/5-row intake allowance, isolate that row without changing
 // an older canonical original, and preserve a truthful partial receipt.
 // No retry on auth, D1 quota, transport, or generic readback failure.
 const postRows=records=>post({records,controlPlaneRoot,token,fetchImpl});
 const checkedAck=(ack,n)=>{
  if(ack?.readback_verified!==true||
     !Number.isSafeInteger(ack.stored)||!Number.isSafeInteger(ack.duplicate)||
     ack.stored<0||ack.duplicate<0||ack.stored+ack.duplicate!==n)
   throw Error("PHASE2IB_FASTLANE_RAW_D1_RECEIPT_INVALID");
  return ack;
 };
 let inserted=0,unchanged=0,collisionCount=0,acknowledged=[];
 const collisionByCategory=Object.fromEntries(CATEGORIES.map(c=>[c,0]));
 try{
  const ack=checkedAck(await postRows(plan.records),plan.selected_count);
  inserted=ack.stored;unchanged=ack.duplicate;
  acknowledged=plan.records;
 }catch(error){
  // Restrict isolation to tiny admitted batches. Larger batches retain the
  // original fail-closed path, never increase the existing D1 provider budget.
  if(error?.message!=="PHASE2H_PRIVATE_RAW_IDENTITY_COLLISION"||maxRows>5)
   throw error;
  for(const row of plan.records){
   try{
    const ack=checkedAck(await postRows([row]),1);
    inserted+=ack.stored;unchanged+=ack.duplicate;
    acknowledged.push(row);
   }catch(singleError){
    if(singleError?.message!=="PHASE2H_PRIVATE_RAW_IDENTITY_COLLISION")
     throw singleError;
    collisionCount++;
    collisionByCategory[row.category]++;
   }
  }
 }
 if(inserted+unchanged+collisionCount!==plan.selected_count)
  throw Error("PHASE2IB_FASTLANE_RAW_D1_ROW_ACCOUNTING_INVALID");
 const {records:privateRecords,...safe}=plan;
 return {schema:"geomacro.phase2ib.fastlane-private-raw-stage.v1",
  status:collisionCount>0
   ?(acknowledged.length>0
     ?"PARTIAL_CANONICAL_D1_READBACK_COLLISION_QUARANTINED"
     :"IDENTITY_COLLISION_HELD_NO_CANONICAL_ACK")
   :"CANONICAL_D1_EXACT_READBACK_VERIFIED",
  ...safe,
  deferred_count:plan.deferred_count+collisionCount,
  d1_inserted:inserted,d1_unchanged:unchanged,
  d1_readback_verified:acknowledged.length>0,
  all_selected_d1_readback_verified:collisionCount===0,
  collision_held:collisionCount,collision_held_by_category:collisionByCategory,
  b2_verified:false,event_country_verified:false,
  commercial_rights_verified:false,original_body_collected:false,
  payments:0,
 };
}
