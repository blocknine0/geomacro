/**
 * D1 launch SLO assessment. Input MUST be independently gathered hourly
 * provider and delivery receipts. Never infer a success from missing data.
 * Does not touch PREDGE, D1, protected secrets or private source payloads.
 */
export const READ_LIMIT=5_000_000,WRITE_LIMIT=100_000;
const HOUR=3_600_000;
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const validDate=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
export function evaluateD1LaunchWindow(receipts,{hours=72,maxGapMinutes=90}={}){
 if(!Array.isArray(receipts)||!integer(hours)||hours<72||hours>168||
    !integer(maxGapMinutes)||maxGapMinutes<60||maxGapMinutes>120)
  throw Error("D1_LAUNCH_WINDOW_ARGUMENTS_INVALID");
 const sorted=[...receipts].sort((a,b)=>
   Date.parse(a?.observed_at_utc??"")-Date.parse(b?.observed_at_utc??""));
 if(sorted.some(x=>x?.schema!=="geomacro.d1-launch-hourly-receipt.v1"||
    !validDate(x.observed_at_utc)))
  throw Error("D1_LAUNCH_RECEIPT_SCHEMA_INVALID");
 const reasons=new Set();
 if(!sorted.length)return Object.freeze({status:"PENDING",hours_observed:0,samples:0,reasons:["NO_RECEIPTS"],daily:[]});
 const end=Date.parse(sorted.at(-1).observed_at_utc),start=end-hours*HOUR;
 const window=sorted.filter(x=>Date.parse(x.observed_at_utc)>=start);
 if(window.length<Math.floor(hours*60/maxGapMinutes))
  reasons.add("SAMPLING_DENSITY_INSUFFICIENT");
 if(Date.parse(window[0].observed_at_utc)>start+maxGapMinutes*60_000)
  reasons.add("WINDOW_START_UNOBSERVED");
 for(let i=1;i<window.length;i++){
  const diff=Date.parse(window[i].observed_at_utc)-Date.parse(window[i-1].observed_at_utc);
  if(diff<=0||diff>maxGapMinutes*60_000)reasons.add("MISSING_HOURLY_RECEIPTS");
 }
 const daily=new Map();
 let lastByDay=new Map();
 let deferredSeen=false,recoveryVerified=0;
 const countedRecoveryRuns=new Set();
 for(const r of window){
  const p=r.provider,day=r.observed_at_utc.slice(0,10);
  if(p?.verified!==true||p.day_utc!==day||
    !integer(p.rows_read)||!integer(p.rows_written)){
    reasons.add("PROVIDER_QUOTA_UNVERIFIED");continue;
  }
  if(p.rows_read>=READ_LIMIT||p.rows_written>=WRITE_LIMIT)
    reasons.add("D1_DAILY_QUOTA_EXHAUSTED");
  const prev=lastByDay.get(day);
  if(prev&&(p.rows_read<prev.rows_read||p.rows_written<prev.rows_written))
    reasons.add("D1_PROVIDER_COUNTER_REGRESSION");
  lastByDay.set(day,{rows_read:p.rows_read,rows_written:p.rows_written});
  const earlier=daily.get(day);
  if(!earlier||earlier.rows_read<p.rows_read||earlier.rows_written<p.rows_written)
   daily.set(day,{day_utc:day,rows_read:p.rows_read,rows_written:p.rows_written});
  if(r.public?.verified!==true||r.public.http_status!==200)
    reasons.add("PUBLIC_DELIVERY_NOT_VERIFIED");
  if(r.critical?.independent_d1_readback_verified!==true)
    reasons.add("CRITICAL_INGESTION_READBACK_NOT_VERIFIED");
  if(r.deploy?.exact_main_sha_verified!==true&&
     r.deploy?.runtime_code_equivalence_verified!==true)
    reasons.add("PRODUCTION_SHA_NOT_VERIFIED");
  if(r.backlog?.verified!==true||!integer(r.backlog.pending_artifacts)||
     !integer(r.backlog.aged_out_artifacts))
    reasons.add("DEFERRED_BACKLOG_COUNTER_UNVERIFIED");
  else{
    deferredSeen ||= r.backlog.pending_artifacts>0;
    if(r.backlog.aged_out_artifacts>0)reasons.add("UNRECOVERABLE_BACKLOG_AGE");
  }
  if(!integer(r.recovery?.verified_replayed_items))
    reasons.add("REPLAY_SUCCESS_COUNTER_UNVERIFIED");
  else if(r.recovery.verified_replayed_items>0){
    if(!integer(r.recovery.source_run_id)||r.recovery.source_run_id<1)
      reasons.add("REPLAY_UNIQUE_RUN_ID_UNVERIFIED");
    else if(!countedRecoveryRuns.has(r.recovery.source_run_id)){
      countedRecoveryRuns.add(r.recovery.source_run_id);
      recoveryVerified+=r.recovery.verified_replayed_items;
    }
  }
 }
 if(deferredSeen&&recoveryVerified===0)
  reasons.add("DEFERRED_REPLAY_NOT_OBSERVED");
 if(window.length&&end-Date.parse(window[0].observed_at_utc)<(hours*HOUR-maxGapMinutes*60_000))
  reasons.add("OBSERVATION_WINDOW_TOO_SHORT");
 return Object.freeze({
  schema:"geomacro.d1-launch-72h-acceptance.v1",
  status:reasons.size?"PENDING":"ACCEPTED",
  hours_observed:Number(((end-Date.parse(window[0].observed_at_utc))/HOUR).toFixed(2)),
  samples:window.length,reasons:[...reasons].sort(),
  daily:[...daily.values()].sort((a,b)=>a.day_utc.localeCompare(b.day_utc)),
  deferred_seen:deferredSeen,verified_replayed_items:recoveryVerified,
  inference_from_green_workflow_only:false,
 });
}
