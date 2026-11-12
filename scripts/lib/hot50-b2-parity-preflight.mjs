/** Fail-closed pre-admission for independent P0B B2 GET audit.
 * Never skip a nonzero D1 backlog or claim a complete provider inventory.
 * This predicts GET headroom only; the global B2 governor remains authoritative
 * for every physical request and can refuse at any instant.
 */
const fail=code=>{throw Error(code)};
const count=x=>Number.isSafeInteger(x)&&x>=0;
export function admitHot50IndexedB2Readback({
 census,quota,storageGuard,limit,now=Date.now()
}={}){
 if(!Number.isSafeInteger(limit)||limit<1||limit>250||!Number.isFinite(now))
  fail("ACTIVATION_B2_PARITY_PREFLIGHT_INPUT_INVALID");
 const backlog=census?.backlog;
 if(census?.schema!=="geomacro.hot50-production-activation-census.v1"||
    !count(backlog?.total_unhandled)||
    backlog.total_unhandled!==0||
    backlog.d1_zero_unhandled_proven!==true||
    backlog.exact_bundle_journal_mismatch!==0)
  fail("PARITY_D1_BACKLOG_NOT_ZERO");
 const n=backlog?.archived_outboxes;
 if(!count(n)||n===0)fail("ACTIVATION_B2_PARITY_NO_ARCHIVED_PHYSICAL_OBJECT");
 if(n>limit)fail("ACTIVATION_B2_PARITY_READ_BUDGET_PARTIAL_BEFORE_B2");
 if(storageGuard?.open!==false)
  fail("ACTIVATION_B2_PARITY_STORAGE_CIRCUIT_NOT_VERIFIED_CLEAR");
 const day=new Date(now).toISOString().slice(0,10);
 if(quota?.day_utc!==day||
    !count(quota?.used?.total)||!count(quota?.used?.GET)||
    !count(quota?.limits?.total)||!count(quota?.limits?.GET))
  fail("ACTIVATION_B2_PARITY_CURRENT_GOVERNOR_QUOTA_UNKNOWN");
 if(quota.used.total+n>quota.limits.total||
    quota.used.GET+n>quota.limits.GET)
  fail("ACTIVATION_B2_PARITY_B2_ACCOUNT_READ_HEADROOM_UNAVAILABLE");
 return Object.freeze({status:"ADMITTED_FOR_BOUNDED_B2_GET_ONLY",
  expected_physical_gets:n,provider_governor_still_required:true,
  provider_quota_is_not_atomic_reservation:true,production_mutations:0,
  physical_parity_not_yet_proven:true,zero_list_policy_preserved:true,
  no_funds:true});
}
