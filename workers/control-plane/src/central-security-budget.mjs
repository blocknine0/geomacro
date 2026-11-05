import {CENTRAL_SECURITY_POLICIES} from './central-security-policies.mjs';
// D1 batch is one transaction: global and client reservations cannot interleave.
// Count denied attempts conservatively; saturate counters at limit+1.
export const SECURITY_COUNTER_SQL = `INSERT INTO central_security_budget
 (route_class,bucket_kind,bucket_key,window_start,request_count) VALUES (?,?,?,?,1)
 ON CONFLICT(route_class,bucket_kind,bucket_key) DO UPDATE SET
 window_start=max(central_security_budget.window_start,excluded.window_start),
 request_count=CASE WHEN central_security_budget.window_start>=excluded.window_start
 THEN min(central_security_budget.request_count+1,?) ELSE 1 END
 RETURNING request_count`;
// A late request on a new client slot must use the already-advanced global
// window too; otherwise its next request could reopen a fresh client budget.
export const SECURITY_CLIENT_COUNTER_SQL=SECURITY_COUNTER_SQL.replace(
 'VALUES (?,?,?,?,1)',
 "VALUES (?,?,?,(SELECT window_start FROM central_security_budget WHERE route_class=? AND bucket_kind='global' AND bucket_key='all'),1)"
);
/**
 * Predge research has ONE authenticated purpose-scoped bearer and ONE fixed
 * global 500/UTC-day limit. There is no need to update a second client bucket
 * for each successful read. A single atomic UPSERT/RETURNING on the existing
 * global row preserves the exact *shared* ceiling (including any other caller
 * of the central-security budget route) with HALF the D1 physical writes.
 *
 * This is not a fallback that can overrun the limit or serve unmetered news.
 * On D1 outage, unknown receipt, SQL error or unexpected policy drift the
 * caller still returns HTTP 503 and does not query the research journal.
 */
export async function consumePredgeResearchDailyBudget(db,{now=Date.now()}={}){
 const route="predge_research_news",policy=CENTRAL_SECURITY_POLICIES[route];
 if(!Number.isSafeInteger(now)||now<0||!db?.prepare||
    policy?.windowSeconds!==86400||policy.global!==500||
    policy.perClient!==500||policy.failClosed!==true||
    policy.distributed!==true)
  throw Error("PREDGE_RESEARCH_GOVERNOR_CONFIGURATION_UNAVAILABLE");
 const start=Math.floor(now/(86400*1000))*86400;
 // Shared global slot is also incremented by the existing central security
 // /v1/security/budget route, so a second route cannot evade the 500/day cap.
 let row;
 try{
  row=await db.prepare(SECURITY_COUNTER_SQL)
   .bind(route,"global","all",start,policy.global+1).first();
 }catch{
  // Preserve a fixed public failure while allowing callers to log a bounded
  // safe provider error class without leaking raw D1, SQL or credentials.
  throw Error("PREDGE_RESEARCH_GOVERNOR_ATOMIC_D1_UNAVAILABLE");
 }
 if(!Number.isSafeInteger(row?.request_count)||row.request_count<1||
    row.request_count>policy.global+1)
  throw Error("PREDGE_RESEARCH_GOVERNOR_D1_READBACK_INVALID");
 return {ok:true,schema:"geomacro.central-security-budget.v1",store:"d1",
  route_class:route,allowed:row.request_count<=policy.global,
  retry_after_seconds:Math.max(1,Math.ceil(start+86400-now/1000)),
  atomic_global_slot:true,physical_d1_counter_rows_written:1,
  daily_utc_request_hard_cap:500};
}

export async function consumeCentralSecurityBudget(db,body,{now=Date.now()}={}){
 const route=body?.route_class,key=body?.client_key;
 if(!Object.hasOwn(CENTRAL_SECURITY_POLICIES,route??'')||
   typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key)||
   Object.keys(body).some(k=>!['route_class','client_key'].includes(k)))
   throw Error('INVALID_SECURITY_BUDGET_INPUT');
 if(!Number.isSafeInteger(now)||now<0||!db?.batch)throw Error('SECURITY_BUDGET_UNAVAILABLE');
 const policy=CENTRAL_SECURITY_POLICIES[route],seconds=policy.windowSeconds;
 const start=Math.floor(now/(seconds*1000))*seconds;
 const result=await db.batch([
   db.prepare(SECURITY_COUNTER_SQL).bind(route,'global','all',start,policy.global+1),
   db.prepare(SECURITY_CLIENT_COUNTER_SQL).bind(route,'client',key.slice(0,6),route,policy.perClient+1),
 ]);
 if(!Array.isArray(result)||result.length!==2||result.some(x=>x.success!==true||
   x.results?.length!==1||!Number.isSafeInteger(x.results[0].request_count)||x.results[0].request_count<1))
   throw Error('SECURITY_BUDGET_UNAVAILABLE');
 return {ok:true,schema:'geomacro.central-security-budget.v1',store:'d1',route_class:route,
   allowed:result[0].results[0].request_count<=policy.global&&result[1].results[0].request_count<=policy.perClient,
   retry_after_seconds:Math.max(1,Math.ceil(start+seconds-now/1000))};
}
