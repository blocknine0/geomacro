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

/**
 * A previously staged first-party original may retain the same immutable
 * URL/native-clock key while its headline/credit changes upstream.
 * A single 409 must never overwrite that D1 ID nor abort all other originals.
 * Bisect ONLY the exact immutable collision; all other D1 failures stay fatal.
 * Callers cap input to five rows, so retries are tightly bounded.
 */
export async function postPhase2iCollisionIsolated({
 records,controlPlaneRoot,token,fetchImpl=fetch,post=postPhase2hPrivateRawRecords
}={}){
 if(!Array.isArray(records)||records.length>5)
  throw Error("PHASE2IB_FASTLANE_COLLISION_BATCH_CAP");
 let stored=0,duplicate=0,rejected=0,requests=0;
 const rejectedByCategory=count([]);
 const emit=async group=>{
  requests++;
  try{
   const reply=await post({records:group,controlPlaneRoot,token,fetchImpl});
   if(reply?.readback_verified!==true||
      reply?.per_original_readback_verified!==true||
      reply?.verified_originals!==group.length||
      !Number.isSafeInteger(reply.stored)||!Number.isSafeInteger(reply.duplicate)||
      reply.stored<0||reply.duplicate<0||
      reply.stored+reply.duplicate!==group.length)
     throw Error("PHASE2IB_FASTLANE_RAW_D1_RECEIPT_INVALID");
   stored+=reply.stored;duplicate+=reply.duplicate;
  }catch(error){
   if(error?.message!=="PHASE2H_PRIVATE_RAW_IDENTITY_COLLISION")
    throw error;
   if(group.length===1){
    rejected++;rejectedByCategory[group[0].category]++;return;
   }
   const mid=Math.floor(group.length/2);
   await emit(group.slice(0,mid));
   await emit(group.slice(mid));
  }
 };
 if(records.length)await emit(records);
 if(stored+duplicate+rejected!==records.length)
  throw Error("PHASE2IB_FASTLANE_COLLISION_RECONCILIATION_FAILED");
 return Object.freeze({stored,duplicate,rejected_conflicts:rejected,
  rejected_conflicts_by_category:rejectedByCategory,
  d1_successful_readback_records:stored+duplicate,
  per_original_authenticated_d1_verified:stored+duplicate>0,
  readback_verified:stored+duplicate>0,
  attempts:requests});
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
 const receipt=await postPhase2iCollisionIsolated({
  records:plan.records,controlPlaneRoot,token,fetchImpl,post,
 });
 const {records:privateRecords,...safe}=plan;
 return {schema:"geomacro.phase2ib.fastlane-private-raw-stage.v1",
  status:receipt.readback_verified
   ?(receipt.rejected_conflicts>0
     ?"CANONICAL_D1_PARTIAL_READBACK_WITH_IMMUTABLE_CONFLICTS"
     :"CANONICAL_D1_EXACT_READBACK_VERIFIED")
   :"IMMUTABLE_ORIGINAL_CONFLICTS_NO_POSITIVE_D1_RECEIPT",
  ...safe,d1_inserted:receipt.stored,d1_unchanged:receipt.duplicate,
  d1_rejected_conflicts:receipt.rejected_conflicts,
  rejected_conflicts_by_category:receipt.rejected_conflicts_by_category,
  d1_successful_readback_records:receipt.d1_successful_readback_records,
  per_original_authenticated_d1_verified:receipt.per_original_authenticated_d1_verified,
  d1_readback_verified:receipt.readback_verified,b2_verified:false,
  event_country_verified:false,commercial_rights_verified:false,
  original_body_collected:false,payments:0,
 };
}
