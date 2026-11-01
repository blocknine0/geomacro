/** Quota-bounded Phase2H admission for the existing 15-minute registered-source
 * publisher. This is NOT a new producer or source poll; the existing account
 * governor must grant critical admission before a caller invokes this module.
 * Every attempt re-observes native evidence; nothing is called durably queued.
 */
export const REGISTERED_SOURCE_MAX_ORIGINALS_PER_SLOT=3;
export const REGISTERED_SOURCE_SLOT_MINUTES=15;
const CATEGORIES=["geopolitics","macro","rare_earth"];
const MS=60_000;
export function planRegisteredPrivateOriginals(records,{now=new Date()}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
    !Array.isArray(records)||records.length>5000)
  throw Error("REGISTERED_PRIVATE_ORIGINAL_ADMISSION_INVALID");
 const fresh=[],seen=new Set();
 let invalid_or_stale=0;
 for(const row of records){
  const native=Date.parse(row?.original?.original_published_at??"");
  if(!row||!/^[a-f0-9]{64}$/u.test(row.record_id??"")||
     !CATEGORIES.includes(row.category)||!Number.isFinite(native)||
     native>now.getTime()+MS||now.getTime()-native>72*60*MS){
   invalid_or_stale++;continue;
  }
  if(seen.has(row.record_id))
   throw Error("REGISTERED_PRIVATE_ORIGINAL_DUPLICATE_ID");
  seen.add(row.record_id);fresh.push(row);
 }
 const lanes=CATEGORIES.map(category=>fresh.filter(row=>row.category===category)
  .sort((a,b)=>b.original.original_published_at.localeCompare(
    a.original.original_published_at)||a.record_id.localeCompare(b.record_id)));
 const cycle=Math.floor(now.getTime()/(REGISTERED_SOURCE_SLOT_MINUTES*MS));
 const counts=[0,0,0],offsets=lanes.map(rows=>rows.length?cycle%rows.length:0);
 const selected=[];
 while(selected.length<REGISTERED_SOURCE_MAX_ORIGINALS_PER_SLOT){
  let advanced=false;
  for(let i=0;i<lanes.length&&selected.length<REGISTERED_SOURCE_MAX_ORIGINALS_PER_SLOT;i++){
   if(counts[i]>=lanes[i].length)continue;
   selected.push(lanes[i][(offsets[i]+counts[i])%lanes[i].length]);
   counts[i]++;advanced=true;
  }
  if(!advanced)break;
 }
 if(selected.length>REGISTERED_SOURCE_MAX_ORIGINALS_PER_SLOT||
    selected.length>fresh.length)throw Error("REGISTERED_PRIVATE_ORIGINAL_ADMISSION_MISMATCH");
 return Object.freeze({
  schema:"geomacro.phase2h.registered-source-quota-admission.v1",
  records:selected,observed_unique:fresh.length,
  selected_count:selected.length,deferred_reobserve:fresh.length-selected.length,
  invalid_or_stale,
  selected_by_category:Object.fromEntries(CATEGORIES.map((c,i)=>[c,counts[i]])),
  source_poll_interval_minutes:REGISTERED_SOURCE_SLOT_MINUTES,
  max_originals_per_slot:REGISTERED_SOURCE_MAX_ORIGINALS_PER_SLOT,
  max_collision_attempts:selected.length*2+1,
  next_slot_requires_fresh_source_and_quota:true,
  no_future_publication_guarantee:true,predge_unchanged:true,
  rights_verified:false,paid_eligible:false,payments:0
 });
}
