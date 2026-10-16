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
   db.prepare(SECURITY_COUNTER_SQL).bind(route,'client',key.slice(0,6),start,policy.perClient+1),
 ]);
 if(!Array.isArray(result)||result.length!==2||result.some(x=>x.success!==true||
   x.results?.length!==1||!Number.isSafeInteger(x.results[0].request_count)||x.results[0].request_count<1))
   throw Error('SECURITY_BUDGET_UNAVAILABLE');
 return {ok:true,schema:'geomacro.central-security-budget.v1',store:'d1',route_class:route,
   allowed:result[0].results[0].request_count<=policy.global&&result[1].results[0].request_count<=policy.perClient,
   retry_after_seconds:Math.max(1,Math.ceil(start+seconds-now/1000))};
}
