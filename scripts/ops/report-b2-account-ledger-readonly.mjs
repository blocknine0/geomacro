#!/usr/bin/env node
// #1827 one bounded read-only D1 account-wide B2 reservation-ledger audit.
// No B2 traffic, provider SDK, source/payload rows, Supabase or payments.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { B2_DAILY_LIMITS } from "../../workers/control-plane/src/b2-account-quota.mjs";

const OPERATIONS = Object.freeze(["GET", "PUT", "HEAD", "NATIVE_AUTH"]);
const WORKFLOW = /^[a-z][a-z0-9_-]{1,47}$/u;
const MAX_ROWS = 100;
const fields = ["total_requests","get_requests","put_requests","head_requests","native_auth_requests"];
function integer(value) {
  const n=Number(value);
  if(!Number.isSafeInteger(n) || n<0) throw Error("B2_LEDGER_COUNT_INVALID");
  return n;
}
export function parseB2QuotaWranglerReport(raw,{now=new Date()}={}) {
  if(typeof raw!=="string" || raw.length>64*1024) throw Error("B2_LEDGER_OUTPUT_INVALID");
  let parsed;
  try { parsed=JSON.parse(raw); } catch { throw Error("B2_LEDGER_OUTPUT_INVALID"); }
  const blocks=Array.isArray(parsed)?parsed:parsed?.result;
  if(!Array.isArray(blocks) || blocks.length!==1 ||
     blocks[0]?.success!==true || !Array.isArray(blocks[0]?.results)) {
    throw Error("B2_LEDGER_D1_PROOF_UNAVAILABLE");
  }
  const rows=blocks[0].results;
  if(rows.length>MAX_ROWS) throw Error("B2_LEDGER_WORKFLOW_ROWS_TRUNCATED");
  if(!(now instanceof Date) || !Number.isFinite(now.getTime())) throw Error("B2_LEDGER_CLOCK_INVALID");
  const day=now.toISOString().slice(0,10);
  const basic={
    schema:"geomacro.b2-account-ledger-readonly.v1",
    checked_at:now.toISOString(),day_utc:day,
    provider_account_usage_verified:false,
    // A D1 ledger records only participating B2 clients, not the provider bill.
    all_external_clients_governed_independently_verified:false,
    current_195x3_intelligence_verified:false,
    commercial_eligibility_verified:false,
    d1_writes:0,b2_requests:0,supabase_requests:0,payment_performed:false,
    limits:B2_DAILY_LIMITS,
  };
  if(rows.length===0) return {
    ...basic,status:"UNKNOWN_NO_D1_LEDGER_ROW",ledger_observed:false,
    reserved:null,per_workflow:null,unattributed_reserved:null,
  };
  let reference=null;
  const byWorkflow=new Map();
  const usedKeys=new Set();
  const totals={GET:0,PUT:0,HEAD:0,NATIVE_AUTH:0};
  for(const rawRow of rows) {
    if(!rawRow || typeof rawRow!=="object" || rawRow.day_utc!==day)
      throw Error("B2_LEDGER_DAY_INVALID");
    const counts=fields.map(f=>integer(rawRow[f]));
    if(!reference) reference=counts;
    else if(counts.some((n,i)=>n!==reference[i])) throw Error("B2_LEDGER_TOTALS_INCONSISTENT");
    if(rawRow.workflow_id===null && rawRow.operation===null) {
      if(rows.length!==1 || integer(rawRow.workflow_requests)!==0)
        throw Error("B2_LEDGER_EMPTY_RECEIPT_INVALID");
      continue;
    }
    if(typeof rawRow.workflow_id!=="string" || !WORKFLOW.test(rawRow.workflow_id) ||
       !OPERATIONS.includes(rawRow.operation)) throw Error("B2_LEDGER_WORKFLOW_INVALID");
    const id=rawRow.workflow_id+"|"+rawRow.operation;
    if(usedKeys.has(id)) throw Error("B2_LEDGER_DUPLICATE_WORKFLOW_ROW");
    usedKeys.add(id);
    const count=integer(rawRow.workflow_requests);
    totals[rawRow.operation]+=count;
    if(!Number.isSafeInteger(totals[rawRow.operation])) throw Error("B2_LEDGER_COUNT_INVALID");
    const item=byWorkflow.get(rawRow.workflow_id)??{workflow_id:rawRow.workflow_id,GET:0,PUT:0,HEAD:0,NATIVE_AUTH:0};
    item[rawRow.operation]=count;
    byWorkflow.set(rawRow.workflow_id,item);
  }
  if(!reference) throw Error("B2_LEDGER_TOTALS_MISSING");
  const reserved={total:reference[0],GET:reference[1],PUT:reference[2],
    HEAD:reference[3],NATIVE_AUTH:reference[4]};
  const sum=OPERATIONS.reduce((s,k)=>s+reserved[k],0);
  if(sum!==reserved.total ||
     OPERATIONS.some(k=>totals[k]>reserved[k]) ||
     reserved.total>B2_DAILY_LIMITS.total ||
     OPERATIONS.some(k=>reserved[k]>B2_DAILY_LIMITS[k])) throw Error("B2_LEDGER_RESERVATION_INVALID");
  const attributed=OPERATIONS.reduce((s,k)=>s+totals[k],0);
  return {
    ...basic,status:"D1_LEDGER_OBSERVED",ledger_observed:true,
    reserved,per_workflow:[...byWorkflow.values()].sort((a,b)=>a.workflow_id.localeCompare(b.workflow_id)),
    unattributed_reserved:reserved.total-attributed,
    // No claim that nonparticipating clients or B2 billing totals were audited.
  };
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  let raw="";
  try {
    for await(const chunk of process.stdin) {
      raw+=chunk.toString("utf8");
      if(raw.length>64*1024) throw Error("B2_LEDGER_OUTPUT_INVALID");
    }
    const result=parseB2QuotaWranglerReport(raw);
    mkdirSync("artifacts/b2-quota-readonly",{recursive:true});
    writeFileSync("artifacts/b2-quota-readonly/account-ledger.json",
      JSON.stringify(result,null,2)+"\n",{mode:0o600});
    console.log(JSON.stringify(result));
    if(!result.ledger_observed) process.exitCode=2;
  } catch {
    console.error("::error::B2_D1_ACCOUNT_QUOTA_READONLY_NOT_VERIFIED");
    process.exitCode=2;
  }
}
