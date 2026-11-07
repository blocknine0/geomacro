/** Private quota governor: no publicly exposed route, UTC analytics sync. */
import {syncProviderRows} from './quotaCircuitBreaker.ts';
export {QuotaBudgetDO} from './quotaCircuitBreaker.ts';
interface QuotaWorkerEnv {
 CLOUDFLARE_ACCOUNT_ID:string;
 CLOUDFLARE_BILLING_READ_TOKEN:string;
 D1_BUDGET_INTERNAL_SECRET:string;
 D1_QUOTA_DO:any;
}
const query=`query D1Today($accountTag:String!,$start:Date!,$end:Date!){
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
 const day=new Date().toISOString().slice(0,10);
 const response=await fetch('https://api.cloudflare.com/client/v4/graphql',{
  method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),
  headers:{Authorization:'Bearer '+env.CLOUDFLARE_BILLING_READ_TOKEN,
   'Content-Type':'application/json'},
  body:JSON.stringify({query,variables:{accountTag:env.CLOUDFLARE_ACCOUNT_ID,start:day,end:day}})
 });
 const json:any=await response.json().catch(()=>null);
 const accounts=json?.data?.viewer?.accounts;
 if(!response.ok||json?.errors?.length||!Array.isArray(accounts)||accounts.length!==1)
  throw Error('D1_QUOTA_GRAPHQL_UNVERIFIED');
 const rows=accounts[0].d1AnalyticsAdaptiveGroups;
 if(!Array.isArray(rows)||rows.length<1||rows.length>=1000)
  throw Error('D1_QUOTA_GRAPHQL_ROWS_INCOMPLETE');
 let read=0,written=0;const ids=new Set();
 for(const item of rows){
  if(item.dimensions?.date!==day||typeof item.dimensions.databaseId!=='string'||
   ids.has(item.dimensions.databaseId)||!Number.isSafeInteger(item.sum?.rowsRead)||
   !Number.isSafeInteger(item.sum?.rowsWritten)||item.sum.rowsRead<0||item.sum.rowsWritten<0)
   throw Error('D1_QUOTA_GRAPHQL_GROUP_INVALID');
  ids.add(item.dimensions.databaseId);
  read+=item.sum.rowsRead;written+=item.sum.rowsWritten;
 }
 if(!Number.isSafeInteger(read)||!Number.isSafeInteger(written))throw Error('D1_QUOTA_COUNTER_OVERFLOW');
 await syncProviderRows(env,read,written);
}
export default {
 fetch(){return Response.json({ok:false,error:'QUOTA_GOVERNOR_NOT_PUBLIC'},{status:404})},
 async scheduled(_controller:unknown,env:QuotaWorkerEnv){
  // A missed/failed Cloudflare GraphQL sync makes DO reservations HOLD.
  await updateUsage(env);
 }
};
