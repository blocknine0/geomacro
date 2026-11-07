#!/usr/bin/env node
/** Complete CLOSED UTC calendar day, across every D1 DB in the account. */
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {BUDGET,ACCOUNT_RE,envString,graphql,need,sha256,canonical,signedReport,holdError,freshUtcDay} from './release-common.ts';
const QUERY=`query GeoMacroD1Day($accountTag:string!,$start:Date!,$end:Date!){
 viewer{accounts(filter:{accountTag:$accountTag}){
  d1AnalyticsAdaptiveGroups(limit:1000,filter:{date_geq:$start,date_leq:$end}){
   sum{rowsRead rowsWritten} dimensions{date databaseId}
  }
 }}
}`;
export async function observedD1Day(day:string){
 need(freshUtcDay(day),'D1_PROOF_DAY_INVALID');
 const account=envString('CLOUDFLARE_ACCOUNT_ID',32);
 need(ACCOUNT_RE.test(account),'D1_PROOF_ACCOUNT_INVALID');
 const data=await graphql(QUERY,{accountTag:account,start:day,end:day});
 const accounts=data.viewer?.accounts;
 need(Array.isArray(accounts)&&accounts.length===1,'D1_PROOF_ACCOUNT_AMBIGUOUS');
 const groups=accounts[0].d1AnalyticsAdaptiveGroups;
 need(Array.isArray(groups)&&groups.length>0&&groups.length<1000,'D1_PROOF_MISSING_OR_TRUNCATED_GROUPS');
 const seen=new Set<string>();let rowsRead=0,rowsWritten=0;
 const databaseReceipts=[];
 for(const g of groups){
  const id=g.dimensions?.databaseId;
  const r=g.sum?.rowsRead,w=g.sum?.rowsWritten;
  need(typeof id==='string'&&id.length>=10&&!seen.has(id)&&g.dimensions.date===day&&
   Number.isSafeInteger(r)&&r>=0&&Number.isSafeInteger(w)&&w>=0,'D1_PROOF_GROUP_INVALID');
  seen.add(id);rowsRead+=r;rowsWritten+=w;
  need(Number.isSafeInteger(rowsRead)&&Number.isSafeInteger(rowsWritten),'D1_PROOF_COUNTER_OVERFLOW');
  databaseReceipts.push({database_id:id,rows_read:r,rows_written:w});
 }
 databaseReceipts.sort((a,b)=>a.database_id.localeCompare(b.database_id));
 return {day,rows_read:rowsRead,rows_written:rowsWritten,database_count:seen.size,database_receipts:databaseReceipts,
  provider_query_result_sha256:sha256(canonical(data)),observed_at:new Date().toISOString()};
}
export async function main(args=process.argv.slice(2)){
 const selected=args.find(x=>/^\d{4}-\d{2}-\d{2}$/.test(x));
 const day=selected??new Date(Date.now()-86400000).toISOString().slice(0,10);
 need(args.every(a=>a===day),'D1_PROOF_ARGUMENT_INVALID');
 // The complete UTC window must be *closed* and provider analytics have
 // time to settle; a same-day or immediately-at-midnight result is partial.
 const end=Date.parse(day+'T00:00:00.000Z')+86400000;
 need(Date.now()>=end+60*60*1000,'D1_PROOF_FULL_DAY_NOT_SETTLED');
 const usage=await observedD1Day(day);
 need(usage.rows_read<=BUDGET&&usage.rows_written<=BUDGET,'D1_PROOF_140K_BREACH');
 const report={schema:'geomacro.d1-account-utc-24h-observation.v1',status:'PASS',
  period_start_utc:day+'T00:00:00.000Z',period_end_exclusive_utc:new Date(end).toISOString(),
  expected_last_second_utc:new Date(end-1000).toISOString(),
  budget_rows_read:BUDGET,budget_rows_written:BUDGET,
  ...usage,all_account_databases:true,no_unreported_group_claimed:false,
  analytics_provider_observation_not_provider_signed_ledger:true,
  account_wide_atomic_hard_cap_guaranteed:false,no_funds:true};
 const output='artifacts/release/d1-quota-proof-'+day+'.json';
 signedReport(output,report);
 console.log(JSON.stringify({status:'PASS',report:output,rows_read:usage.rows_read,rows_written:usage.rows_written}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 main().catch(e=>{console.error(JSON.stringify({status:'HOLD',code:holdError(e),no_partial_day_proof:true}));process.exitCode=2});
}