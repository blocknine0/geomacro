/**
 * GeoMacro free Website Intelligence self-healing policy.
 * Never interprets a scheduled green CI/synthetic placeholder as live data.
 * Recovery actions are existing workflow_dispatch entrypoints whose own
 * account-wide quota governor, immutable IDs, credentials and PREDGE locks
 * remain authoritative. This module neither mutates data nor contacts sources.
 */
export const SELF_HEAL_SCHEMA="geomacro.news-self-heal-decision.v1";
const CATEGORIES=["geopolitics","macro","rare_earth"];
const HOUR=3_600_000,WINDOW=72*HOUR;
const STATIC_WORKFLOW="deploy-permanent-public-finds-archive.yml";
const HOURLY_WORKFLOW="website-derived-news-continuity.yml";
const outcome=(status,reason,workflow=null,counts=null)=>Object.freeze({
 schema:SELF_HEAL_SCHEMA,status,reason,workflow,counts,
 original_dates_modified:false,paid_delivery:false,
 predge_modified:false,new_d1_quota:false
});
const parse=stamp=>Date.parse(typeof stamp==="string"?stamp:"");
export function planNewsSelfHeal({
 archive=null,archiveAvailable=false,d1=null,d1Available=false,
 websiteOk=null,researchAllowed=false,now=Date.now(),
 classifyDisplay=()=>null,isArchiveEligible=()=>false
}={}){
 if(!Number.isFinite(now)||typeof researchAllowed!=="boolean")
  return outcome("BLOCKED","INPUT_INVALID");
 if(!archiveAvailable||!archive)
  return outcome("RECOVER","STATIC_ARCHIVE_UNAVAILABLE",STATIC_WORKFLOW);
 const {index,latest,coverage,daily}=archive;
 const clock=parse(latest?.checked_at);
 if(!index||!latest||!coverage||!daily||
    latest.schema!=="geomacro.website-derived-news-feed.v1"||latest.ok!==true||
    index.schema!=="geomacro.permanent-derived-news-archive-index.v1"||
    coverage.schema!=="geomacro.free-derived-archive-eligibility.v1"||
    daily.schema!=="geomacro.public-daily-official-finds.v1"||
    latest.retention_hours!==72||latest.chargeable!==false||
    latest.scored!==false||latest.supabase_dependency!==false||
    coverage.paid_customer_eligible!==false||
    daily.chargeable!==false||daily.official_only!==true||
    !Array.isArray(latest.signals)||latest.signals.length>250||
    !Array.isArray(daily.signals)||daily.signals.length>36||
    !Number.isSafeInteger(index.total_signals)||
    index.total_signals<latest.signals.length)
  return outcome("BLOCKED","ARCHIVE_CONTRACT_INVALID");
 if(!Number.isFinite(clock)||clock>now+60_000||
    index.updated_at!==latest.checked_at||
    coverage.checked_at!==latest.checked_at||
    daily.generated_at!==latest.checked_at)
  return outcome("RECOVER","STATIC_COHORT_MISMATCH",STATIC_WORKFLOW);
 if(now-clock>=4*HOUR)
  return outcome("RECOVER","STATIC_CLOCK_EXPIRED",STATIC_WORKFLOW);
 if(!researchAllowed)
  return outcome("HELD","D1_RESEARCH_QUOTA_HELD");
 if(!d1Available||!d1)
  return outcome("BLOCKED","D1_BUNDLE_UNAVAILABLE");
 if(d1.schema!=="geomacro.website-derived-news-bundle.v1"||
    d1.ok!==true||d1.complete!==true||d1.item_cap!==600||
    !Array.isArray(d1.signals)||d1.signals.length>600||
    d1.returned_rows!==d1.signals.length||
    !Array.isArray(d1.first_ingest)||
    d1.first_ingest.length!==d1.signals.length)
  return outcome("BLOCKED","D1_BUNDLE_CONTRACT_INVALID");
 if(typeof classifyDisplay!=="function"||typeof isArchiveEligible!=="function")
  return outcome("BLOCKED","POLICY_MISSING");
 // Latest is an intentionally bounded 250-row preview; it is NOT evidence
 // that a D1 row beyond the preview is missing from immutable monthly shards.
 if(Number(coverage.free_displayable_outside_latest_preview)>0)
  return outcome("BLOCKED","ARCHIVE_PREVIEW_INCOMPLETE");
 const archived=new Map(),seen=new Set();
 for(const s of latest.signals){
  if(!CATEGORIES.includes(s?.category)||typeof s.id!=="string"||
      seen.has(s.id)||!Number.isFinite(parse(s.published_at)))
   return outcome("BLOCKED","STATIC_ROW_INVALID");
  archived.set(s.id,s);seen.add(s.id);
 }
 const firstSeen=new Map();
 for(let i=0;i<d1.signals.length;i++){
  const s=d1.signals[i],t=d1.first_ingest[i];
  if(!CATEGORIES.includes(s?.category)||typeof s.id!=="string"||
     t?.id!==s.id||firstSeen.has(s.id))
   return outcome("BLOCKED","D1_ID_OR_FIRST_INGEST_INVALID");
  firstSeen.set(s.id,parse(t.first_seen_at));
 }
 const counts={geopolitics:0,macro:0,rare_earth:0};
 let ambiguous=0;
 for(const s of d1.signals){
  const pub=parse(s.published_at);
  if(!Number.isFinite(pub)||pub>now||pub<now-WINDOW)continue;
  const old=archived.get(s.id);
  if(old){
   if(old.published_at!==s.published_at||old.category!==s.category||
     old.date_precision!==s.date_precision||old.status!==s.status)
     return outcome("BLOCKED","IMMUTABLE_ID_CONFLICT");
   continue;
  }
  if(classifyDisplay(s)!==null||!isArchiveEligible(s,now,{allowHistorical:false}))
   continue;
  const first=firstSeen.get(s.id);
  if(!Number.isFinite(first)||first>now+60_000){
   ambiguous++;continue;
  }
  // Do not churn a publisher that is already in-flight or whose D1 write is
  // newer than one full hourly plus recovery period.
  if(now-first>=90*60_000)counts[s.category]++;
 }
 const overdue=Object.values(counts).reduce((sum,value)=>sum+value,0);
 if(overdue>0)return outcome("RECOVER","ELIGIBLE_D1_STATIC_BACKLOG",
   HOURLY_WORKFLOW,counts);
 if(websiteOk===false)return outcome("BLOCKED","WEBSITE_RENDER_UNAVAILABLE");
 if(ambiguous>0)return outcome("BLOCKED","D1_FIRST_INGEST_UNVERIFIED");
 return outcome("HEALTHY","STATIC_D1_SITE_CONSISTENT");
}
/** No endless runs: <=1 in-flight and no accepted dispatch in past 2h;
 * repeated systemic failures open a six-hour circuit after three dispatches. */
export function decideSelfHealDispatch(decision,runs,now=Date.now()){
 if(decision?.status!=="RECOVER"||!decision.workflow)
  return Object.freeze({dispatch:false,reason:"NO_RECOVERY_REQUIRED"});
 if(!Array.isArray(runs)||runs.length>100||!Number.isFinite(now))
  return Object.freeze({dispatch:false,reason:"WORKFLOW_RUN_HISTORY_UNVERIFIED"});
 const recent=runs.filter(r=>{
  const at=parse(r.created_at);
  return Number.isFinite(at)&&at<=now+60_000&&now-at<=6*HOUR;
 });
 if(recent.some(r=>r.status==="queued"||r.status==="waiting"||
    r.status==="in_progress"||r.status==="requested"||r.status==="pending"))
  return Object.freeze({dispatch:false,reason:"EXISTING_RECOVERY_OR_WRITER_RUNNING"});
 const dispatched=recent.filter(r=>r.event==="workflow_dispatch");
 if(dispatched.length>=3)
  return Object.freeze({dispatch:false,reason:"RECOVERY_CIRCUIT_OPEN_6H"});
 if(dispatched.some(r=>now-parse(r.created_at)<2*HOUR))
  return Object.freeze({dispatch:false,reason:"RECOVERY_DISPATCH_2H_COOLDOWN"});
 if(recent.some(r=>now-parse(r.created_at)<25*60_000))
  return Object.freeze({dispatch:false,reason:"RECENT_WRITER_SETTLING"});
 return Object.freeze({dispatch:true,reason:"BOUNDED_REPAIR_PERMITTED",
   workflow:decision.workflow});
}
