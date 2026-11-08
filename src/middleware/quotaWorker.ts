/** Private quota governor: no publicly exposed route, UTC analytics sync. */
import {syncProviderRows} from './quotaCircuitBreaker.ts';
export {QuotaBudgetDO} from './quotaCircuitBreaker.ts';
interface QuotaWorkerEnv {
 CLOUDFLARE_ACCOUNT_ID:string;
 CLOUDFLARE_BILLING_READ_TOKEN:string;
 D1_BUDGET_INTERNAL_SECRET:string;
 D1_QUOTA_DO:any;
}
const query=`query D1PaidCycle($accountTag:string!,$start:Date!,$end:Date!){
 viewer{accounts(filter:{accountTag:$accountTag}){
  d1AnalyticsAdaptiveGroups(limit:1000,filter:{date_geq:$start,date_leq:$end}){
   sum{rowsRead rowsWritten} dimensions{databaseId date}
  }
 }}
}`;
async function updateUsage(env:QuotaWorkerEnv){
 if(!/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID||'')||
  (env.CLOUDFLARE_BILLING_READ_TOKEN||'').length<20||
  (env.D1_BUDGET_INTERNAL_SECRET||'').length<32)throw Error('D1_QUOTA_SYNC_CONFIG_MISSING');
 const now=new Date(),day=now.toISOString().slice(0,10);
 const anchor=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),5);
 const billingCycleStart=new Date(now.getTime()>=anchor?anchor:
  Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-1,5)).toISOString().slice(0,10);
 const response=await fetch('https://api.cloudflare.com/client/v4/graphql',{
  method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),
  headers:{Authorization:'Bearer '+env.CLOUDFLARE_BILLING_READ_TOKEN,
   'Content-Type':'application/json'},
  body:JSON.stringify({query,variables:{accountTag:env.CLOUDFLARE_ACCOUNT_ID,start:billingCycleStart,end:day}})
 });
 const json:any=await response.json().catch(()=>null);
 const accounts=json?.data?.viewer?.accounts;
 if(!response.ok||json?.errors?.length||!Array.isArray(accounts)||accounts.length!==1)
  throw Error('D1_QUOTA_GRAPHQL_UNVERIFIED');
 const rows=accounts[0].d1AnalyticsAdaptiveGroups;
 if(!Array.isArray(rows)||rows.length<1||rows.length>=1000)
  throw Error('D1_QUOTA_GRAPHQL_ROWS_INCOMPLETE');
 let read=0,written=0,monthRead=0,monthWritten=0,seenToday=false;
 const seen=new Set<string>();
 for(const item of rows){
  const date=item.dimensions?.date,id=item.dimensions?.databaseId;
  if(typeof date!=='string'||date<billingCycleStart||date>day||
     typeof id!=='string'||id.length<10||
     seen.has(date+'|'+id)||
     !Number.isSafeInteger(item.sum?.rowsRead)||
     !Number.isSafeInteger(item.sum?.rowsWritten)||
     item.sum.rowsRead<0||item.sum.rowsWritten<0)
   throw Error('D1_QUOTA_GRAPHQL_GROUP_INVALID');
  seen.add(date+'|'+id);
  monthRead+=item.sum.rowsRead;monthWritten+=item.sum.rowsWritten;
  if(date===day){
   seenToday=true;
   read+=item.sum.rowsRead;written+=item.sum.rowsWritten;
  }
 }
 if(!seenToday||![read,written,monthRead,monthWritten].every(Number.isSafeInteger))
  throw Error('D1_QUOTA_COUNTER_OVERFLOW_OR_CURRENT_DAY_UNOBSERVED');
 await syncProviderRows(env,read,written,monthRead,monthWritten,billingCycleStart);
}
export default {
 fetch(){return Response.json({ok:false,error:'QUOTA_GOVERNOR_NOT_PUBLIC'},{status:404})},
 async scheduled(_controller:unknown,env:QuotaWorkerEnv){
  // A missed/failed Cloudflare GraphQL sync makes DO reservations HOLD.
  await updateUsage(env);
 }
};
