/**
 * Pure no-funds recovery policy for the EXISTING five-minute original news
 * writer. A green contract-only job, unsigned source pulse or queued run is
 * NOT evidence of an actual production D1 article readback.
 */
export const FASTLANE_WORKFLOW="five-minute-original-news-fastlane.yml";
const ACTUAL_JOB="original-five-minute-derived-news";
const WRITE_STEP="Publish bounded current original-dated three-category derived news";
const MIN=60_000;
const MAX_AGE=15*MIN;
const DISPATCH_COOLDOWN=17*MIN;
const EVENTS=new Set(["schedule","workflow_dispatch","push"]);
const isDate=x=>typeof x==="string" && Number.isFinite(Date.parse(x));
// Parse only plain timestamped stdout JSON, never echoed shell source or a
// named green step. Not-due/held runs cannot manufacture completion evidence.
export function actualSourceIntakeReceipt(log,started,completed){
 if(typeof log!=="string"||log.length>3_000_000||
    !Number.isFinite(started)||!Number.isFinite(completed)||started>completed)return null;
 const rows=[];
 for(const line of log.split("\n")){
  const match=line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z) (\{.*\})\r?$/u);
  if(!match)continue;
  try{rows.push({at:Date.parse(match[1]),body:JSON.parse(match[2])});}catch{/* no evidence */}
 }
 const one=schema=>rows.filter(r=>r.body?.schema===schema);
 if(one('geomacro.source-intake-deferred.v1').length)return null;
 const checkpoints=one('geomacro.fastlane-source-checkpoint-receipt.v1');
 const receipts=one('geomacro.source-intake-completed.v1');
 if(checkpoints.length!==1||receipts.length!==1)return null;
 const c=checkpoints[0],r=receipts[0];
 if(!Number.isFinite(c.at)||!Number.isFinite(r.at)||c.at<started||
    r.at<c.at||r.at>completed||c.body.checkpoint_writes!==3||
    c.body.raw_upstream_stored!==false||c.body.partner_client_receipt_asserted!==false||
    !Array.isArray(c.body.categories)||c.body.categories.length!==3||
    [...c.body.categories].sort().join(',')!=='geopolitics,macro,rare_earth'||
    r.body.source_checkpoint_acknowledged!==true||
    ![5,10,15,30,60].includes(r.body.interval_minutes)||
    ![3,5,10,25,50].includes(r.body.max_new_rows)||
    !Number.isSafeInteger(r.body.retained_new_rows)||r.body.retained_new_rows<0||
    r.body.retained_new_rows>r.body.max_new_rows)return null;
 return r.at;
}
export function actualFiveMinutePublisherCompletion(run,jobs,now=Date.now(),log=null){
 if(!run||run.head_branch!=="main"||!EVENTS.has(run.event)||
    run.status!=="completed"||run.conclusion!=="success"||
    !Array.isArray(jobs))return null;
 const actual=jobs.find(j=>j.name===ACTUAL_JOB);
 if(!actual||actual.status!=="completed"||actual.conclusion!=="success"||
   !Array.isArray(actual.steps)||!actual.steps.some(step=>
      step.name===WRITE_STEP&&step.conclusion==="success")||
   !isDate(actual.completed_at))return null;
 const completed=Date.parse(actual.completed_at);
 if(completed>now+MIN||completed<now-60*MIN||!isDate(run.created_at))return null;
 return actualSourceIntakeReceipt(log,Date.parse(run.created_at),completed);
}
export function decideFiveMinuteNewsRecovery(runs,publisherProofs={},now=Date.now()){
 if(!Array.isArray(runs)||runs.length>30||!Number.isFinite(now))
   throw Error("FASTLANE_WATCH_INPUT_INVALID");
 let latestVerifiedPoll=null;
 let pending=false,recentDispatch=false;
 for(const r of runs){
  if(!Number.isSafeInteger(r?.id)||r.id<=0||r.head_branch!=="main"||
     !EVENTS.has(r.event)||!isDate(r.created_at))continue;
  const started=Date.parse(r.created_at),age=now-started;
  if(age<0||age>60*MIN)continue;
  if(["queued","in_progress","pending","requested","waiting"].includes(r.status)
      &&age<MAX_AGE)pending=true;
  if(r.event==="workflow_dispatch"&&age<DISPATCH_COOLDOWN)
    recentDispatch=true;
  const proof=publisherProofs[r.id];
  if(typeof proof==="number"&&Number.isFinite(proof)&&
     proof>=started-2*MIN&&proof<=now+MIN &&
     (latestVerifiedPoll===null||proof>latestVerifiedPoll))
     latestVerifiedPoll=proof;
 }
 const minutesSinceVerified=latestVerifiedPoll===null?null:
   Math.floor((now-latestVerifiedPoll)/MIN);
 const healthy=latestVerifiedPoll!==null&&
   now-latestVerifiedPoll<=MAX_AGE;
 const reason=healthy?"RECENT_GENUINE_D1_PUBLISHER_RUN":
   pending?"LIVE_OR_QUEUED_PUBLISHER_RUN":
   recentDispatch?"RECENT_RECOVERY_DISPATCH_COOLDOWN":
   "MISSING_VERIFIED_FASTLANE_POLL";
 return Object.freeze({
  dispatch:reason==="MISSING_VERIFIED_FASTLANE_POLL",
  reason,last_verified_poll_age_minutes:minutesSinceVerified,
  // No estimated 20-minute SLA; collection is best-effort at origin.
  github_schedule_exact_guarantee:false,
  country_195x3_all_news_guarantee:false,
  signed_product_qualified:false,payment_performed:false,
 });
}
