#!/usr/bin/env node
/** Complete CLOSED UTC calendar day, across every D1 DB in the account. */
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {D1_DAILY_READ_CEILING,D1_DAILY_WRITE_CEILING,ACCOUNT_RE,envString,graphql,need,canonicalContentSha256,canonical,signedReport,holdError,freshUtcDay} from './release-common.ts';
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
 const variables={accountTag:account,start:day,end:day};
 let data:any,credential_source:'BILLING_READ_TOKEN'|'EXISTING_ACCOUNT_API_TOKEN'='BILLING_READ_TOKEN';
 try{
  data=await graphql(QUERY,variables);
 }catch(error){
  // Only access-denial permits ONE read-only attempt with the existing
  // protected Cloudflare API token. Never invent an account, reuse a stale
  // snapshot, weaken the within the owner's paid daily ceilings gate, or accept a partial provider response.
  if(!(error instanceof Error)||error.message!=='RELEASE_GRAPHQL_ACCESS_DENIED')
   throw error;
  const primary=process.env.CLOUDFLARE_BILLING_READ_TOKEN??'';
  const secondary=process.env.CLOUDFLARE_API_TOKEN??'';
  need(secondary.length>=20&&secondary!==primary,
   'D1_PROOF_NO_DISTINCT_EXISTING_CREDENTIAL');
  try{
   data=await graphql(QUERY,variables,'CLOUDFLARE_API_TOKEN');
  }catch(secondError){
   if(secondError instanceof Error&&secondError.message==='RELEASE_GRAPHQL_ACCESS_DENIED')
    throw Error('D1_PROOF_BOTH_EXISTING_CREDENTIALS_DENIED');
   throw secondError;
  }
  credential_source='EXISTING_ACCOUNT_API_TOKEN';
 }
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
  analytics_credential_source:credential_source,
  provider_query_result_sha256:canonicalContentSha256(canonical({day,rows_read:rowsRead,rows_written:rowsWritten,
   database_count:seen.size,database_receipts:databaseReceipts})),observed_at:new Date().toISOString()};
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
 const budgetPass=usage.rows_read<=D1_DAILY_READ_CEILING&&
  usage.rows_written<=D1_DAILY_WRITE_CEILING;
 // Real verified over-budget readings are still evidence; never lose the
 // receipt, but a HOLD receipt cannot be consumed as a PASS by promotion.
 const report={schema:'geomacro.d1-account-utc-24h-observation.v1',status:budgetPass?'PASS':'HOLD',
  period_start_utc:day+'T00:00:00.000Z',period_end_exclusive_utc:new Date(end).toISOString(),
  expected_last_second_utc:new Date(end-1000).toISOString(),
  budget_rows_read:D1_DAILY_READ_CEILING,
  budget_rows_written:D1_DAILY_WRITE_CEILING,
  ...usage,all_account_databases:true,no_unreported_group_claimed:false,
  analytics_provider_observation_not_provider_signed_ledger:true,
  account_wide_atomic_hard_cap_guaranteed:false,no_funds:true};
 const output='artifacts/release/d1-quota-proof-'+day+'.json';
 signedReport(output,report);
 // Allow operators to see genuine usage even when over the owner's paid daily ceilings; the signed report
 // remains HOLD and the job fails safely. No account identifiers printed.
 console.log(JSON.stringify({status:budgetPass?'PASS':'HOLD',report:output,
  rows_read:usage.rows_read,rows_written:usage.rows_written,
  analytics_credential_source:usage.analytics_credential_source}));
 need(budgetPass,'D1_PROOF_PAID_OWNER_DAILY_CEILING_BREACH');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 main().catch(e=>{console.error(JSON.stringify({status:'HOLD',code:holdError(e),no_partial_day_proof:true}));process.exitCode=2});
}