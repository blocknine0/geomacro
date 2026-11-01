/**
 * Existing hourly WEBSITE collector only: bounded, source-neutral, fair raw
 * original admission. This does not create a cron, bypass a quota governor,
 * change source clocks/IDs, or grant commercial delivery rights.
 *
 * The trusted 15-minute original fastlane remains unchanged. Recollecting
 * current 72h sources each hour makes unselected originals eligible again;
 * no unverified durable "pending" assertion is created.
 */
export const HOURLY_PRIVATE_ORIGINAL_LIMIT=15;
export const HOURLY_ORIGINAL_CATEGORIES=Object.freeze([
 "geopolitics","macro","rare_earth"
]);
const HOUR=3_600_000;
const WINDOW=72*HOUR;
const isInteger=x=>Number.isSafeInteger(x)&&x>=0;

export function planHourlyPrivateOriginals(records,{now=new Date()}={}){
 if(!Array.isArray(records)||!Number.isFinite(now?.getTime?.())||
    records.length>5000)
  throw Error("HOURLY_PRIVATE_ORIGINAL_QUOTA_ARGUMENTS_INVALID");
 const nowMs=now.getTime();
 const distinct=new Map();
 let expiredOrInvalid=0;
 for(const row of records){
  const time=Date.parse(row?.original?.original_published_at??"");
  if(!row||typeof row.record_id!=="string"||
     !/^[a-f0-9]{64}$/u.test(row.record_id)||
     !HOURLY_ORIGINAL_CATEGORIES.includes(row.category)||
     !Number.isFinite(time)||time>nowMs+60_000||
     nowMs-time>WINDOW){
   expiredOrInvalid++;continue;
  }
  // Do not guess which byte version has authority. The private raw builder
  // already quarantines in-run ambiguous identities. Reject duplicates here.
  if(distinct.has(row.record_id))
   throw Error("HOURLY_PRIVATE_ORIGINAL_DUPLICATE_ID");
  distinct.set(row.record_id,row);
 }
 const valid=[...distinct.values()];
 const lanes=HOURLY_ORIGINAL_CATEGORIES.map(category=>
  valid.filter(x=>x.category===category)
   .sort((a,b)=>b.original.original_published_at.localeCompare(
      a.original.original_published_at)||a.record_id.localeCompare(b.record_id)));
 const cycle=Math.floor(nowMs/HOUR);
 const counts=lanes.map(()=>0);
 const step=Math.ceil(HOURLY_PRIVATE_ORIGINAL_LIMIT/lanes.length);
 const offsets=lanes.map(lane=>lane.length?
  (cycle%lane.length)*(step%lane.length)%lane.length:0);
 const selected=[];
 while(selected.length<HOURLY_PRIVATE_ORIGINAL_LIMIT){
  let advanced=false;
  for(let i=0;i<lanes.length&&selected.length<HOURLY_PRIVATE_ORIGINAL_LIMIT;i++){
   const lane=lanes[i];
   if(counts[i]>=lane.length)continue;
   selected.push(lane[(offsets[i]+counts[i])%lane.length]);
   counts[i]++;advanced=true;
  }
  if(!advanced)break;
 }
 const perCategory=Object.fromEntries(HOURLY_ORIGINAL_CATEGORIES.map((x,i)=>[
  x,counts[i]
 ]));
 const available=valid.length;
 if(!isInteger(available)||selected.length>HOURLY_PRIVATE_ORIGINAL_LIMIT||
    selected.length>available)
  throw Error("HOURLY_PRIVATE_ORIGINAL_QUOTA_RECONCILIATION_FAILED");
 return Object.freeze({
  schema:"geomacro.hourly-private-original-admission.v1",
  records:selected,
  observed_unique:available,
  admitted: selected.length,
  deferred_for_next_hour:available-selected.length,
  expired_or_invalid:expiredOrInvalid,
  by_category:perCategory,
  max_per_hour:HOURLY_PRIVATE_ORIGINAL_LIMIT,
  max_collision_attempts:Math.max(1,selected.length*2+1),
  cadence_minutes:60,
  admission_from_existing_quota_only:true,
  immutable_source_clocks_unchanged:true,
  automatic_retry_requires_fresh_source_observation:true,
  future_publication_guaranteed:false,
  commercial_rights_verified:false,
  paid_eligible:false,
  predge_modified:false,
  payments:0
 });
}
