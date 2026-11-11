/**
 * Durable token-bucket pacing for optional B2 stream archive operations.
 * A token is NEVER an authorization to exceed the authoritative account-wide
 * B2 D1 reservation, provider-plan headroom, or owner's spend cap.
 * The checked live D1 governor is authoritative. Policy drift is HOLD.
 * Live per-day ceilings may be raised ONLY by a separately reviewed provider/
 * owner entitlement change and matching Worker deployment; not from traffic.
 */
import {B2_DAILY_LIMITS,readB2AccountQuota,reserveB2AccountQuota}
 from "./b2-account-quota.mjs";

const KINDS=new Set(["GET","PUT","HEAD","NATIVE_AUTH"]);
const fail=code=>{throw Error("RISK_STREAM_B2_"+code)};
export const B2_STREAM_PACING=Object.freeze({
 schema:"geomacro.b2-stream-token-bucket.v1",
 max_burst_ops:40,
 refill_window_seconds:86400,
 daily_budget_reserve_fraction:0.10,
 account_wide_atomic_reservation_required:true,
 on_overload:"DEFER_OR_PRIVATE_R2_FALLBACK",
 auto_raise_provider_quota:false,
});

function validLive(live,now){
 const day=new Date(now).toISOString().slice(0,10);
 if(live?.ok!==true||live.schema!=="geomacro.b2-account-quota-status.v1"||
    live.day_utc!==day||!live.limits||typeof live.limits!=="object"||
    !live.used||typeof live.used!=="object")fail("LIVE_QUOTA_TELEMETRY_UNAVAILABLE");
 for(const key of ["total","GET","PUT","HEAD","NATIVE_AUTH"]){
  const limit=live.limits[key],used=live.used[key];
  if(!Number.isSafeInteger(limit)||!Number.isSafeInteger(used)||
     used<0||used>limit||limit!==B2_DAILY_LIMITS[key])
   fail("LIVE_GOVERNOR_POLICY_DRIFT");
 }
 return live;
}
export function planAdaptiveB2Pacing({live,kind,now=Date.now(),reserveFraction=
 B2_STREAM_PACING.daily_budget_reserve_fraction}={}){
 if(!KINDS.has(kind)||!Number.isSafeInteger(now)||now<0||
    reserveFraction<0||reserveFraction>=1)
  fail("PACE_INPUT_INVALID");
 validLive(live,now);
 const totalRemaining=live.limits.total-live.used.total;
 const kindRemaining=live.limits[kind]-live.used[kind];
 const protectedMinimum=Math.ceil(live.limits.total*reserveFraction);
 const remaining=Math.min(Math.max(0,totalRemaining-protectedMinimum),
  kindRemaining);
 const limit=Math.min(live.limits.total,live.limits[kind]);
 const rateMilliPerSecond=Math.max(1,Math.floor(
  limit*1000/B2_STREAM_PACING.refill_window_seconds));
 const capacityMilli=Math.min(B2_STREAM_PACING.max_burst_ops,
  Math.max(1,limit))*1000;
 return Object.freeze({
  schema:B2_STREAM_PACING.schema,
  kind,day_utc:live.day_utc,
  action:remaining>0?"TRY_ATOMIC_TOKEN_RESERVATION":"DEFER_OR_R2",
  quota_remaining_after_account_reserve:remaining,
  capacity_milli:capacityMilli,refill_milli_per_second:rateMilliPerSecond,
  no_provider_quota_increase:true,account_ledger_mandatory:true
 });
}
/**
 * The token-bucket UPSERT and all-account reservation are separate,
 * conservatively consuming a pacing token if the account reservation fails.
 * This never misrepresents an uncertain B2 operation as unbilled or refunded.
 */
export async function reserveAdaptiveB2StreamQuota(env,{kind,workflowId,
 now=Date.now(),read=readB2AccountQuota,
 reserve=reserveB2AccountQuota}={}){
 if(!env?.DB?.prepare||!KINDS.has(kind)||
    typeof workflowId!=="string"||!/^[a-z][a-z0-9_-]{1,47}$/u.test(workflowId))
  fail("BINDINGS_OR_WORKFLOW_INVALID");
 const live=await read(env.DB,{now:new Date(now)});
 const planned=planAdaptiveB2Pacing({live,kind,now});
 if(planned.action!=="TRY_ATOMIC_TOKEN_RESERVATION")
  return {ok:false,status:"DEFER_R2",reason:"ACCOUNT_RESERVE_REQUIRED"};
 const day=planned.day_utc,rate=planned.refill_milli_per_second,cap=planned.capacity_milli;
 const sql="INSERT INTO risk_stream_b2_token_bucket"+
  "(day_utc,kind,tokens_milli,updated_at_ms) VALUES (?,?,?,?) "+
  "ON CONFLICT(day_utc,kind) DO UPDATE SET "+
  "tokens_milli=MIN(?,risk_stream_b2_token_bucket.tokens_milli+"+
  "(MAX(0,? - risk_stream_b2_token_bucket.updated_at_ms)/1000)*?)-1000, "+
  "updated_at_ms=? "+
  "WHERE MIN(?,risk_stream_b2_token_bucket.tokens_milli+"+
  "(MAX(0,? - risk_stream_b2_token_bucket.updated_at_ms)/1000)*?)>=1000 "+
  "RETURNING tokens_milli";
 const acquired=await env.DB.prepare(sql).bind(day,kind,cap-1000,now,
  cap,now,rate,now,cap,now,rate).first();
 if(!acquired||!Number.isFinite(Number(acquired.tokens_milli)))
  return {ok:false,status:"DEFER_R2",reason:"B2_PACING_TOKENS_EXHAUSTED"};
 const reservation=await reserve(env.DB,{kind,workflow_id:workflowId},{now:new Date(now)});
 if(reservation?.ok!==true||reservation?.reserved!==true)
  return {ok:false,status:"DEFER_R2",reason:"GLOBAL_ACCOUNT_TICKET_DENIED"};
 return {ok:true,status:"RESERVED",kind,day_utc:day,
  shared_account_reservation:reservation,
  token_burst_cannot_increase_daily_provider_limit:true};
}
