/** Zero-cost deterministic 195-country source acceptance rotation.
 * Offline calendar routing, not a claim of issuer reachability or event freshness.
 * Two countries share the existing per-country 12+4 bounded GET caps per day.
 * No GitHub run-number dependency (push/PR runs cannot silently skip countries).
 */
export const COUNTRY_COUNT=195;
export const MAX_COUNTRIES_PER_RUN=2;
export const ROTATION_DAYS=Math.ceil(COUNTRY_COUNT/MAX_COUNTRIES_PER_RUN);
export const ROTATION_EPOCH_MS=Date.parse("2026-10-17T00:00:00.000Z");
const DAY=86_400_000;
const INT=/^(0|[1-9]\d{0,2})$/u;
const parseIndex=(value,label)=>{
  if(typeof value!=="string"||!INT.test(value))throw Error("COUNTRY_195_"+label+"_INVALID");
  return Number(value);
};
/** Pass eventName=schedule, workflow_dispatch, or push; push is a no-op.
 * Days before rotation epoch are rejected rather than given a fictitious slot.
 */
export function planCountry195DailyRotation({
  eventName, now=new Date(), requestedStart="", requestedCount="",
}={}){
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))
    throw Error("COUNTRY_195_ROTATION_CLOCK_INVALID");
  if(!["schedule","workflow_dispatch","push"].includes(eventName))
    throw Error("COUNTRY_195_ROTATION_EVENT_INVALID");
  if(eventName==="push")return null;
  if(eventName==="workflow_dispatch" && requestedStart!==""){
    const start=parseIndex(requestedStart,"START");
    const count=requestedCount===""?1:parseIndex(requestedCount,"COUNT");
    if(start>=COUNTRY_COUNT||count<1||count>MAX_COUNTRIES_PER_RUN||start+count>COUNTRY_COUNT)
      throw Error("COUNTRY_195_SAFE_BATCH_RANGE_INVALID");
    return Object.freeze({start,count,trigger:"OPERATOR_PINNED",rotation_day:null,cycle_day:null});
  }
  if(eventName==="schedule" && (requestedStart!==""||requestedCount!==""))
    throw Error("COUNTRY_195_SCHEDULE_OVERRIDE_INVALID");
  const day=Math.floor(now.getTime()/DAY)-Math.floor(ROTATION_EPOCH_MS/DAY);
  if(day<0)throw Error("COUNTRY_195_ROTATION_BEFORE_EPOCH");
  const cycleDay=day%ROTATION_DAYS,start=cycleDay*MAX_COUNTRIES_PER_RUN;
  return Object.freeze({
    start,count:Math.min(MAX_COUNTRIES_PER_RUN,COUNTRY_COUNT-start),
    trigger:"DAILY_UTC_CALENDAR",rotation_day:day,cycle_day:cycleDay,
  });
}
