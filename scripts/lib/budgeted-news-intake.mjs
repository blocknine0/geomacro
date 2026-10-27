import {releaseWindowEvents} from './macro-release-calendar.mjs';
const BUNDLE='https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/website-derived-news-bundle';
export function intakeIsDue(policy,intervalMinutes,now,events=[]){
 if(![5,10,15,30,60].includes(intervalMinutes)||!Number.isFinite(now))throw Error('NEWS_INTAKE_CADENCE_INVALID');
 if(!policy)return true;
 const at=Date.parse(policy.last_success_at);
 if(policy.schema!=='geomacro.news-intake-admission.v1'||!Number.isFinite(at)||at>now)throw Error('NEWS_INTAKE_SUCCESS_CLOCK_INVALID');
 // Only official dated release windows may consume the incident allocation.
 return now-at>=intervalMinutes*60000||releaseWindowEvents(events,now).length>0;
}
export async function readIntakeBaseline({fetchImpl=fetch,readAll,repair,now=Date.now()}){
 const read=async()=>{
  let overcap=null;
  const onlyBundle=async(input,init)=>{
   if(String(input)!==BUNDLE)throw Error('FASTLANE_COMPLETE_BUNDLE_REQUIRED');
   if(overcap)return overcap.clone();
   const r=await fetchImpl(input,init);
   if(r.status===503){try{const body=await r.clone().json();if(body.error==='DERIVED_NEWS_BUNDLE_HARD_CAP_EXCEEDED')overcap=r.clone();}catch{/* never infer a retention fault from other outages */}}
   return r;
  };
  try{return {records:await readAll(onlyBundle,now),overcap:false};}
  catch(e){if(overcap)return {records:null,overcap:true};throw e;}
 };
 const first=await read();if(!first.overcap)return first.records;
 // Exceptional overcapacity recovery only. Healthy polls no longer pay two
 // whole-journal cleanup scans before even examining a source.
 await repair();
 const second=await read();if(second.overcap)throw Error('FASTLANE_RETENTION_RECOVERY_FAILED');
 return second.records;
}
