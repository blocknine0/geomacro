#!/usr/bin/env node
/**
 * Zero-D1-query, account-wide Cloudflare Free admission for bounded bundles.
 * GraphQL usage is OBSERVATIONAL, not an atomic reservation: all consumers
 * must preserve their own D1 caps; unknown metrics are a strict HOLD.
 * Maintains separate protected original ingestion and discretionary research.
 */
import {appendFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {D1_FREE_DAILY,readCloudflareD1AccountQuota} from "./audit-d1-account-daily-quota-readonly.mjs";

export const D1_BUNDLE_LANES=Object.freeze({
  // Strict end-of-day reserves + a finite opening burst. Without pacing,
  // 5-minute and 30-minute jobs can consume an entire day's account headroom
  // during the first hours after UTC reset.
  critical:Object.freeze({read_reserve:750_000,write_reserve:15_000,
    read_opening_burst:1_000_000,write_opening_burst:10_000}),
  research:Object.freeze({read_reserve:1_500_000,write_reserve:30_000,
    read_opening_burst:500_000,write_opening_burst:5_000}),
  maintenance:Object.freeze({read_reserve:2_500_000,write_reserve:50_000,
    read_opening_burst:250_000,write_opening_burst:2_500}),
});
const DAY_MS=86_400_000;
/** Daily shaping is monotonic and resets only with the provider UTC clock. */
export function d1LanePacedCeiling(lane,now){
  if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
     !D1_BUNDLE_LANES[lane])throw Error("D1_LANE_PACING_INVALID");
  const elapsed=Math.max(0,Math.min(DAY_MS,
    now.getTime()-Date.parse(now.toISOString().slice(0,10)+"T00:00:00Z")));
  const settings=D1_BUNDLE_LANES[lane];
  const fraction=elapsed/DAY_MS;
  const allowed=(total,reserve,burst)=>{
    const cap=total-reserve;
    return Math.floor(burst+(cap-burst)*fraction);
  };
  return Object.freeze({
    rows_read:allowed(D1_FREE_DAILY.rows_read,settings.read_reserve,
      settings.read_opening_burst),
    rows_written:allowed(D1_FREE_DAILY.rows_written,settings.write_reserve,
      settings.write_opening_burst),
  });
}
const safeInt=x=>Number.isSafeInteger(x)&&x>=0;
const held=(reason,now)=>Object.freeze({
  schema:"geomacro.d1-free-bundled-work-admission.v1",
  day_utc:now.toISOString().slice(0,10),state:"HELD",
  reason,critical:false,research:false,maintenance:false,source_intake:false,
  d1_queries:0,d1_rows_written:0,b2_requests:0,paid_calls:0,
  budget_is_nonatomic_provider_snapshot:true,
});
export function planD1BundledWork(snapshot,{now=new Date()}={}){
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))
    throw Error("D1_BUNDLE_NOW_INVALID");
  if(!snapshot||snapshot.schema!=="geomacro.d1-account-daily-quota-readonly.v1"||
     snapshot.provider_graphql_usage_observed!==true||
     snapshot.day_utc!==now.toISOString().slice(0,10)||
     !safeInt(snapshot.observed_rows_read)||!safeInt(snapshot.observed_rows_written)||
     snapshot.limits?.rows_read!==D1_FREE_DAILY.rows_read||
     snapshot.limits?.rows_written!==D1_FREE_DAILY.rows_written||
     snapshot.remaining_rows_read!==Math.max(0,D1_FREE_DAILY.rows_read-snapshot.observed_rows_read)||
     snapshot.remaining_rows_written!==Math.max(0,D1_FREE_DAILY.rows_written-snapshot.observed_rows_written))
    return held("D1_ACCOUNT_USAGE_UNVERIFIED",now);

  const paced=Object.fromEntries(Object.keys(D1_BUNDLE_LANES).map(lane=>[
    lane,d1LanePacedCeiling(lane,now),
  ]));
  const grants=Object.fromEntries(Object.entries(D1_BUNDLE_LANES).map(([lane,margin])=>[
    lane,
    snapshot.remaining_rows_read>margin.read_reserve &&
    snapshot.remaining_rows_written>margin.write_reserve &&
    snapshot.observed_rows_read<paced[lane].rows_read &&
    snapshot.observed_rows_written<paced[lane].rows_written,
  ]));
  // One serial five-minute collector can continue during discretionary pacing
  // holds only if the remaining DAY fits its worst-case finite allocation.
  // This never admits the signer, reviewer, R2 exporter or audit fan-out.
  const slotsRemaining=Math.ceil((DAY_MS-(now.getTime()%DAY_MS))/300_000);
  const intakeBudget={rows_read:4000*slotsRemaining+100000,
    rows_written:104*slotsRemaining+2000,remaining_five_minute_slots:slotsRemaining};
  const sourceIntake=grants.critical || (
    snapshot.remaining_rows_read>D1_BUNDLE_LANES.critical.read_reserve+intakeBudget.rows_read &&
    snapshot.remaining_rows_written>D1_BUNDLE_LANES.critical.write_reserve+intakeBudget.rows_written);
  // The observed account budget is the shared physical constraint.
  // Do not declare an exhausted account healthy even if a second DB is idle.
  const state=grants.maintenance?"NORMAL":grants.research?"CONSERVE":
    grants.critical?"CRITICAL_ONLY":"HELD";
  return Object.freeze({
    schema:"geomacro.d1-free-bundled-work-admission.v1",
    day_utc:snapshot.day_utc,state,
    reason:state==="HELD"?"D1_FREE_RESERVE_REACHED":"ACCOUNT_WIDE_HEADROOM_OBSERVED",
    ...grants,source_intake:sourceIntake,
    source_intake_budget_to_utc_reset:intakeBudget,
    source_intake_does_not_admit_signing_or_audits:true,
    observed_rows_read:snapshot.observed_rows_read,
    observed_rows_written:snapshot.observed_rows_written,
    remaining_rows_read:snapshot.remaining_rows_read,
    remaining_rows_written:snapshot.remaining_rows_written,
    // A throttled lane preserves next-hour capacity for actual future events.
    // These are non-atomic provider usage ceilings, not D1 reservations.
    admission_paced_to_utc_day:true,
    paced_ceiling_by_lane:paced,
    // GraphQL is delayed; several parallel workers can still draw down
    // the reserve. Never represent this as a paid or atomic reservation.
    d1_queries:0,d1_rows_written:0,b2_requests:0,paid_calls:0,
    budget_is_nonatomic_provider_snapshot:true,
  });
}
export async function checkD1BundledWork({env=process.env,fetchImpl=fetch,now=new Date()}={}){
  try{
    const quota=await readCloudflareD1AccountQuota({env,fetchImpl,now});
    return planD1BundledWork(quota,{now});
  }catch{
    return held("D1_ACCOUNT_QUOTA_PROBE_FAILED",now);
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const result=await checkD1BundledWork();
  const receipt={
    ...result,
    // No source content, account ID, database ID or credential in logs.
  };
  console.log(JSON.stringify(receipt));
  if(process.env.GITHUB_OUTPUT){
    for(const key of ["critical","research","maintenance","source_intake"]){
      appendFileSync(process.env.GITHUB_OUTPUT,key+"="+String(result[key])+"\n");
    }
    appendFileSync(process.env.GITHUB_OUTPUT,"state="+result.state+"\n");
  }
  if(result.source_intake&&result.critical!==true)
    console.log("::notice::SOURCE_INTAKE_ONLY — bounded original news and static archive may continue; signing/review/audits stay held.");
  if(result.state==="HELD"&&!result.source_intake)
    console.log("::notice::D1_BUNDLED_WORK_HELD — source publication not attempted; coverage degraded, not zero events.");
}
