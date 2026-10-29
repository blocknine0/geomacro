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
import {readCloudflareWorkersPaidProof,WORKERS_PAID_PROOF_SCHEMA} from "../lib/cloudflare-workers-paid-plan-proof.mjs";

// Safeguard shared Cloudflare Free account capacity for the existing PREDGE
// authenticated research pilot (500 atomic requests/UTC day). This is a
// non-atomic planning reserve, NOT a hard Cloudflare quota partition.
// The existing separate D1 rate governor remains the partner request cap.
// No partner token, payload, API behavior or SQL is changed here.
export const PREDGE_D1_FREE_HEADROOM=Object.freeze({
  rows_read:500_000,rows_written:8_000,
  pilot_request_cap_per_utc_day:500,
  basis:"CONSERVATIVE_NONATOMIC_ACCOUNT_WIDE_CAPACITY_RESERVE",
});
export const D1_BUNDLE_LANES=Object.freeze({
  // Strict end-of-day reserves + a finite opening burst. Without pacing,
  // 5-minute and 30-minute jobs can consume an entire day's account headroom
  // during the first hours after UTC reset.
  critical:Object.freeze({read_reserve:750_000+PREDGE_D1_FREE_HEADROOM.rows_read,
    write_reserve:15_000+PREDGE_D1_FREE_HEADROOM.rows_written,
    read_opening_burst:1_000_000,write_opening_burst:10_000}),
  research:Object.freeze({read_reserve:1_500_000+PREDGE_D1_FREE_HEADROOM.rows_read,
    write_reserve:30_000+PREDGE_D1_FREE_HEADROOM.rows_written,
    read_opening_burst:500_000,write_opening_burst:5_000}),
  maintenance:Object.freeze({read_reserve:2_500_000+PREDGE_D1_FREE_HEADROOM.rows_read,
    write_reserve:50_000+PREDGE_D1_FREE_HEADROOM.rows_written,
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
export function planSourceIntake(snapshot,now){
 const remainingMs=DAY_MS-(now.getTime()%DAY_MS);
 // Bound the entire remaining day before admitting a smaller source bundle.
 // Preserve original 750k/15k and ADD dedicated 500k/8k PREDGE safety. Actual
 // cadence is enforced by an authenticated last-success clock, not cron time.
 for(const interval_minutes of [5,10,15,30,60]){
  const slots=Math.ceil(remainingMs/(interval_minutes*60000));
  for(const max_new_rows of [50,25,10,5,3]){
   const rows_read=3200*slots+100000;
   const rows_written=(16*max_new_rows+40)*slots+2000;
   if(snapshot.remaining_rows_read>D1_BUNDLE_LANES.critical.read_reserve+rows_read&&
      snapshot.remaining_rows_written>D1_BUNDLE_LANES.critical.write_reserve+rows_written)
    return {interval_minutes,max_new_rows,rows_read,rows_written,remaining_source_slots:slots,remaining_five_minute_slots:Math.ceil(remainingMs/300000)};
  }
 }
 return null;
}
const held=(reason,now)=>Object.freeze({
  schema:"geomacro.d1-free-bundled-work-admission.v1",
  day_utc:now.toISOString().slice(0,10),state:"HELD",
  reason,critical:false,research:false,maintenance:false,source_intake:false,
  predge_account_headroom_guard_enabled:true,
  predge_account_headroom_planning_reserve:PREDGE_D1_FREE_HEADROOM,
  predge_account_headroom_is_hard_partition:false,
  predge_request_governor_is_separate_and_unchanged:true,
  snapshot_refresh:false,structural_snapshot:false,
  d1_queries:0,d1_rows_written:0,b2_requests:0,paid_calls:0,
  budget_is_nonatomic_provider_snapshot:true,
});
export function planD1BundledWork(snapshot,{now=new Date(),paidProof=null}={}){
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


  // Provider-verified, account-scoped Workers Paid has no 5M/day hard
  // physical read stop. Retain an independent, CONSERVATIVE 18M/180k
  // account-wide DAILY soft budget (well below official monthly allotments).
  // No paid subscription is created. Research, signing, unrelated public
  // backfills and B2 upgrades are NOT granted by this special intake lane.
  const paid=paidProof?.schema===WORKERS_PAID_PROOF_SCHEMA&&
    paidProof.verified===true&&
    paidProof.source==="CLOUDFLARE_ACCOUNT_SUBSCRIPTIONS_BILLING_READ"&&
    paidProof.subscription_changed===false&&
    paidProof.billing_action_performed===false&&
    typeof paidProof.observed_at==="string"&&
    Number.isFinite(Date.parse(paidProof.observed_at))&&
    Date.parse(paidProof.observed_at)<=now.getTime()&&
    now.getTime()-Date.parse(paidProof.observed_at)<=5*60_000;
  if(paid){
    const elapsed=(now.getTime()-Date.parse(snapshot.day_utc+"T00:00:00.000Z"))/DAY_MS;
    const dailyReads=Math.floor(4_000_000+14_000_000*Math.max(0,Math.min(1,elapsed)));
    const dailyWrites=Math.floor(40_000+140_000*Math.max(0,Math.min(1,elapsed)));
    const admitted=snapshot.observed_rows_read<dailyReads&&
      snapshot.observed_rows_written<dailyWrites;
    return Object.freeze({
      schema:"geomacro.d1-free-bundled-work-admission.v1",
      day_utc:snapshot.day_utc,state:admitted?"CRITICAL_ONLY":"HELD",
      reason:admitted?"PROVIDER_VERIFIED_WORKERS_PAID_SOFT_BUDGET":
        "WORKERS_PAID_CONSERVATIVE_SOFT_BUDGET_REACHED",
      critical:admitted,research:false,maintenance:false,
      source_intake:false,source_intake_interval_minutes:null,
      source_intake_max_new_rows:0,snapshot_refresh:false,
      structural_snapshot:false,
      structural_snapshot_max_b2_network_attempts:0,
      structural_snapshot_requires_atomic_b2_account_reservation:true,
      snapshot_refresh_does_not_admit_ingestion:true,
      source_intake_does_not_admit_signing_or_audits:true,
      observed_rows_read:snapshot.observed_rows_read,
      observed_rows_written:snapshot.observed_rows_written,
      // Provider-verified paid capacity is not subjected to the Free physical
      // daily 5M cap; the existing conservative paid soft budget still applies.
      predge_account_headroom_guard_enabled:false,
      predge_account_headroom_planning_reserve:PREDGE_D1_FREE_HEADROOM,
      predge_account_headroom_is_hard_partition:false,
      predge_request_governor_is_separate_and_unchanged:true,
      paid_capacity_verified_by_provider:true,
      free_plan_5m_cap_not_applied_only_with_verified_subscription:true,
      daily_account_soft_limit_read:dailyReads,
      daily_account_soft_limit_write:dailyWrites,
      paid_subscription_change_performed:false,
      paid_billing_is_operator_controlled:true,
      d1_queries:0,d1_rows_written:0,b2_requests:0,paid_calls:0,
      budget_is_nonatomic_provider_snapshot:true,
    });
  }
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
  const intakeBudget=planSourceIntake(snapshot,now);
  const sourceIntake=intakeBudget!==null;
  // Bounded public-serving refresh, even if intake pacing is HELD. The
  // Worker checks the 8-minute revision fence *before* its <=601-row scan.
  // Separate from source intake/signing; reserve 250k read and 5k write rows
  // PLUS the non-atomic protected PREDGE pilot headroom on the account counter.
  const snapshotRefresh=snapshot.remaining_rows_read>
      250_000+PREDGE_D1_FREE_HEADROOM.rows_read &&
    snapshot.remaining_rows_written>
      5_000+PREDGE_D1_FREE_HEADROOM.rows_written &&
    snapshot.observed_rows_read<
      D1_FREE_DAILY.rows_read-250_000-PREDGE_D1_FREE_HEADROOM.rows_read &&
    snapshot.observed_rows_written<
      D1_FREE_DAILY.rows_written-5_000-PREDGE_D1_FREE_HEADROOM.rows_written;
  // The observed account budget is the shared physical constraint.
  // Do not declare an exhausted account healthy even if a second DB is idle.
  // Structural B2 snapshot is not a generic maintenance job: it spends at
  // most 12 atomically reserved B2 operations and a few quota-ledger D1 rows.
  // Admit it only within the EXISTING conservative snapshot refresh corridor;
  // B2 network attempts still require their own shared atomic reservations.
  const structuralSnapshot=snapshotRefresh &&
      snapshot.remaining_rows_read>
      250_100+PREDGE_D1_FREE_HEADROOM.rows_read &&
    snapshot.remaining_rows_written>
      5_100+PREDGE_D1_FREE_HEADROOM.rows_written;
  const state=grants.maintenance?"NORMAL":grants.research?"CONSERVE":
    grants.critical?"CRITICAL_ONLY":"HELD";
  return Object.freeze({
    schema:"geomacro.d1-free-bundled-work-admission.v1",
    day_utc:snapshot.day_utc,state,
    reason:state==="HELD"?(sourceIntake?"DISCRETIONARY_PACING_HELD_SOURCE_ADMITTED":"D1_FREE_RESERVE_REACHED"):"ACCOUNT_WIDE_HEADROOM_OBSERVED",
    ...grants,source_intake:sourceIntake,
    predge_account_headroom_guard_enabled:true,
    predge_account_headroom_planning_reserve:PREDGE_D1_FREE_HEADROOM,
    predge_account_headroom_is_hard_partition:false,
    predge_request_governor_is_separate_and_unchanged:true,
    predge_protected_read_headroom_observed:
      snapshot.remaining_rows_read>PREDGE_D1_FREE_HEADROOM.rows_read,
    predge_protected_write_headroom_observed:
      snapshot.remaining_rows_written>PREDGE_D1_FREE_HEADROOM.rows_written,
    source_intake_interval_minutes:intakeBudget?.interval_minutes??null,
    source_intake_max_new_rows:intakeBudget?.max_new_rows??0,
    snapshot_refresh:snapshotRefresh,
    structural_snapshot:structuralSnapshot,
    structural_snapshot_max_b2_network_attempts:12,
    structural_snapshot_requires_atomic_b2_account_reservation:true,
    snapshot_refresh_max_source_rows_per_run:601,
    snapshot_refresh_does_not_admit_ingestion:true,
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
    // A transient Cloudflare GraphQL transport/429 outage is not D1 quota
    // exhaustion. Retry a bounded READ-ONLY provider usage observation;
    // never retry invalid counters, missing auth, or 403, and never invent
    // rows-read headroom if all attempts fail.
    let quota;
    for(let attempt=0;attempt<3;attempt++){
      try{
        quota=await readCloudflareD1AccountQuota({env,fetchImpl,now});
        break;
      }catch(error){
        const transient=error instanceof Error&&[
          "D1_ACCOUNT_QUOTA_READ_FAILED",
          "D1_ACCOUNT_QUOTA_TRANSIENT_PROVIDER_HTTP",
        ].includes(error.message);
        if(!transient||attempt===2)throw error;
        await new Promise(resolve=>setTimeout(resolve,attempt===0?400:1200));
      }
    }
    // Optional READ-only provider billing evidence. If the account has not
    // enabled Billing Read or paid entitlement proof fails, remain on the
    // original conservative Free plan guard. No magic paid-mode env switch.
    let paidProof=null;
    if(env.CLOUDFLARE_BILLING_READ_TOKEN){
      try{paidProof=await readCloudflareWorkersPaidProof({env,fetchImpl,now});}
      catch{/* ambiguous entitlement always uses Free quota admission */}
    }
    return planD1BundledWork(quota,{now,paidProof});
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
    for(const key of ["critical","research","maintenance","source_intake","snapshot_refresh","structural_snapshot"]){
      appendFileSync(process.env.GITHUB_OUTPUT,key+"="+String(result[key])+"\n");
    }
    for(const key of ["source_intake_interval_minutes","source_intake_max_new_rows"])
      appendFileSync(process.env.GITHUB_OUTPUT,key+"="+String(result[key]??0)+"\n");
    appendFileSync(process.env.GITHUB_OUTPUT,"state="+result.state+"\n");
  }
  if(result.source_intake&&result.critical!==true)
    console.log("::notice::SOURCE_INTAKE_ONLY — bounded original news and static archive may continue; signing/review/audits stay held.");
  if(result.state==="HELD"&&!result.source_intake)
    console.log("::notice::D1_BUNDLED_WORK_HELD — source publication not attempted; coverage degraded, not zero events.");
}
