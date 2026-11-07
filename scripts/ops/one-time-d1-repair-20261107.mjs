/** Owner's explicit 2026-11-07 migration-only overage authorization.
 * Fixed absolute ceilings, never rebased on rerun; all ordinary budgets unchanged.
 */
export const ONE_TIME_D1_REPAIR=Object.freeze({
 id:'OWNER_20261107_COMPLETE_D1_MIGRATION',day_utc:'2026-11-07',
 baseline_inspected_at:'2026-11-07T15:58:26.840Z',
 baseline_rows_read:4464338,baseline_rows_written:415271,
 extra_rows_read_max:600000,extra_rows_written_max:600000,
 read_ceiling:5064338,write_ceiling:1015271,
 minimum_remaining_headroom:80000,
});
export function assessOneTimeD1Repair(receipt,{now=new Date(),env=process.env}={}){
 const a=ONE_TIME_D1_REPAIR;
 const refuse=reason=>({schema:'geomacro.owner-one-time-d1-repair-budget.v1',admitted:false,reason,
  ordinary_daily_targets_unchanged:true,traffic_promotion_authorized:false,payments:0});
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
    now.toISOString().slice(0,10)!==a.day_utc||
    env.GITHUB_ACTIONS!=='true'||env.GITHUB_REPOSITORY!=='blocknine0/geomacro'||
    env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_EVENT_NAME!=='push'||
    env.GEOMACRO_ONE_TIME_D1_REPAIR!==a.id)
  return refuse('ONE_TIME_AUTHORIZATION_EXPIRED_OR_UNVERIFIED');
 const clock=Date.parse(receipt?.inspected_at??'');
 const read=receipt?.daily_read_rows,write=receipt?.daily_written_rows;
 if(receipt?.schema!=='geomacro.d1.zero-traffic-canary-preflight.v1'||
    receipt?.stage!=='A_READ_ONLY'||
    !['CANARY_ACCOUNT_D1_BUDGET_HELD','ZERO_TRAFFIC_PREFLIGHT_READY'].includes(receipt?.reason)||
    receipt.paid_subscription_verified!==true||receipt.d1_bookmark_obtained!==true||
    receipt.worker_baseline_verified!==true||
    receipt.same_run_d1_bookmark_and_worker_version_retrieved!==true||
    receipt.provider_write_operations!==0||receipt.d1_sql_queries_issued!==0||
    receipt.worker_version_uploaded!==false||receipt.payments!==0||
    receipt.normal_read_target!==140000||receipt.normal_write_target!==140000||
    !Number.isSafeInteger(read)||!Number.isSafeInteger(write)||
    read<a.baseline_rows_read||write<a.baseline_rows_written||
    !Number.isFinite(clock)||clock>now.getTime()||now.getTime()-clock>120000||
    receipt.inspected_at.slice(0,10)!==a.day_utc)
  return refuse('ONE_TIME_PROVIDER_RECEIPT_UNVERIFIED');
 const headroom_read=a.read_ceiling-read,headroom_write=a.write_ceiling-write;
 if(headroom_read<a.minimum_remaining_headroom||headroom_write<a.minimum_remaining_headroom)
  return refuse('ONE_TIME_FIXED_ALLOWANCE_EXHAUSTED');
 return {schema:'geomacro.owner-one-time-d1-repair-budget.v1',admitted:true,
  authorization_id:a.id,day_utc:a.day_utc,
  observed_rows_read:read,observed_rows_written:write,
  fixed_read_ceiling:a.read_ceiling,fixed_write_ceiling:a.write_ceiling,
  headroom_read,headroom_write,ordinary_daily_targets_unchanged:true,
  baseline_never_rebased:true,includes_concurrent_account_usage:true,
  provider_hard_cap_guaranteed:false,traffic_promotion_authorized:false,payments:0};
}
