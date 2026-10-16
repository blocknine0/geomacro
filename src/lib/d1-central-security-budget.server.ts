import {createHmac} from 'node:crypto';
const ENDPOINT='https://geomacro-control-plane.daspallab202391.workers.dev/v1/security/budget';
export async function consumeD1CentralSecurityBudget(route:string,key:string,fetchImpl=fetch){
 const root=String(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN??'').trim();
 if(root.length<32)throw Error('D1_SECURITY_BUDGET_CONFIGURATION_REQUIRED');
 const token=createHmac('sha256',root).update('geomacro-control-plane-v1').digest('hex');
 const r=await fetchImpl(ENDPOINT,{method:'POST',redirect:'error',
   headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify({route_class:route,client_key:key}),signal:AbortSignal.timeout(3500)});
 if(r.status!==200&&r.status!==429)throw Error('D1_SECURITY_BUDGET_UNAVAILABLE');
 const text=await r.text();if(text.length>2048)throw Error('D1_SECURITY_BUDGET_INVALID');
 const d=JSON.parse(text);
 if(d?.ok!==true||d.schema!=='geomacro.central-security-budget.v1'||d.store!=='d1'||
   d.route_class!==route||typeof d.allowed!=='boolean'||d.allowed!==(r.status===200)||
   !Number.isSafeInteger(d.retry_after_seconds)||d.retry_after_seconds<1||d.retry_after_seconds>60)
   throw Error('D1_SECURITY_BUDGET_INVALID');
 return d as {allowed:boolean;retry_after_seconds:number};
}
