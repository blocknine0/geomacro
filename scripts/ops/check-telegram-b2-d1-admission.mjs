#!/usr/bin/env node
/**
 * #1827 Telegram consumer: no Backblaze GET while no D1 queue, frozen
 * Supabase writer, or missing shared account-wide D1 GET headroom.
 * This admission is advisory: the canonical B2 S3 client MUST additionally
 * reserve an atomic D1 ticket immediately before EVERY external GET.
 *
 * No Telegram headline, message body, channel, token or D1 object key is
 * included in the Actions admission receipt.
 */
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createB2D1AccountGovernor } from "./b2-d1-account-governor.mjs";
import { B2_DAILY_LIMITS } from "../../workers/control-plane/src/b2-account-quota.mjs";

export const TELEGRAM_DRAIN_MAX=4;
export const TELEGRAM_ADMISSION_SCHEMA="geomacro.telegram-b2-d1-consumer-admission.v1";
const PAIR=/^tg_[a-f0-9]{32}_[a-f0-9]{16}$/u;
const SHA=/^[a-f0-9]{64}$/u;
const QUEUE_STATES=new Set(["PENDING"]);
const OWN = Object.freeze({
  account_wide_reporting_requires_all_clients_governed:true,
});

function requireTrue(ok,code){if(!ok)throw new Error(code);}
function rowsFromD1(body) {
  const a=Array.isArray(body)?body:[body];
  requireTrue(a.length===1 && a[0]?.success!==false &&
    Array.isArray(a[0]?.results), "TELEGRAM_ADMISSION_D1_RESULT_INVALID");
  return a[0].results;
}
export function readTelegramConsumerQueue(body) {
  const rows=rowsFromD1(body);
  requireTrue(rows.length<=TELEGRAM_DRAIN_MAX,
    "TELEGRAM_ADMISSION_QUEUE_UNBOUNDED");
  const ids=new Set();
  for(const item of rows) {
    const id=String(item?.delivery_id??"");
    const digest=String(item?.b2_sha256??"");
    requireTrue(PAIR.test(id)&&SHA.test(digest)&&
      id.endsWith("_"+digest.slice(0,16)) &&
      QUEUE_STATES.has(item.state) && !ids.has(id),
      "TELEGRAM_ADMISSION_D1_POINTER_INVALID");
    ids.add(id);
  }
  return rows.length;
}
export function evaluateTelegramConsumerAdmission({
  pending, supabase=null, quota=null, now=new Date(),
}={}) {
  requireTrue(Number.isInteger(pending)&&pending>=0&&
    pending<=TELEGRAM_DRAIN_MAX&&now instanceof Date&&
    Number.isFinite(now.getTime()),"TELEGRAM_ADMISSION_ARGUMENT_INVALID");
  const common={
    schema:TELEGRAM_ADMISSION_SCHEMA,
    pending_count:pending,
    can_consume:false,
    no_b2_network:true,
    reservation_required_before_each_get:true,
    source_data_newly_verified:false,
    public_published:false, commercial_eligible:false,
    supabase_writes:0,b2_requests:0,usdc_spent:0,
  };
  if(pending===0)return {...common,status:"NO_PENDING_AUTHORIZED_LEADS"};
  // This runner's actual consumer calls the canonical Postgres flash writer.
  // It must NOT read/download private Telegram evidence while that writer
  // is frozen or disabled. Queue pointers are lossless and remain PENDING.
  if(supabase?.ok!==true || supabase?.mode!=="normal" ||
    supabase?.bulk_write_allowed!==true ||
    supabase?.policy?.recurring_ingest_allowed!==true ||
    supabase?.policy?.bulk_supabase_writes_allowed!==true) {
    return {...common,status:"TELEGRAM_CANONICAL_WRITER_QUOTA_HELD"};
  }
  requireTrue(quota?.ok===true &&
    quota.schema==="geomacro.b2-account-quota-status.v1" &&
    quota.day_utc===now.toISOString().slice(0,10) &&
    quota.account_wide_reporting_requires_all_clients_governed===
      OWN.account_wide_reporting_requires_all_clients_governed,
    "TELEGRAM_ADMISSION_SHARED_D1_STATUS_INVALID");
  const used=quota.used,limits=quota.limits;
  requireTrue(used&&limits &&
    limits.total===B2_DAILY_LIMITS.total &&
    ["GET","PUT","HEAD","NATIVE_AUTH"].every(k=>
      limits[k]===B2_DAILY_LIMITS[k] &&
      Number.isSafeInteger(used[k]) && used[k]>=0 && used[k]<=limits[k]) &&
    Number.isSafeInteger(used.total) && used.total>=0 &&
    used.total<=limits.total &&
    used.total===["GET","PUT","HEAD","NATIVE_AUTH"]
      .reduce((sum,k)=>sum+used[k],0),
    "TELEGRAM_ADMISSION_SHARED_D1_COUNTS_INVALID");
  if(used.total+pending>limits.total ||
    used.GET+pending>limits.GET) {
    return {...common,status:"TELEGRAM_SHARED_B2_DAILY_GET_BUDGET_HELD"};
  }
  return {
    ...common,can_consume:true,no_b2_network:false,
    status:"CAN_CONSUME_WITH_ATOMIC_PER_GET_D1_TICKETS",
    no_b2_request_yet:true,
  };
}
function cleanReceipt(receipt){
  const {schema,status,pending_count,can_consume,
    no_b2_network,reservation_required_before_each_get,
    source_data_newly_verified,public_published,commercial_eligible,
    supabase_writes,b2_requests,usdc_spent}=receipt;
  return {schema,status,pending_count,can_consume,no_b2_network,
    reservation_required_before_each_get,source_data_newly_verified,
    public_published,commercial_eligible,supabase_writes,
    b2_requests,usdc_spent};
}
function noWorkSummary(receipt){
  return {
    schema:"geomacro.telegram-drain-proof.v2",
    checked_at:new Date().toISOString(),
    queue_rows:receipt.pending_count,
    verified_objects:0,
    status:receipt.status,
    private_queue_intact:true,
    no_b2_requests:true,
    no_supabase_writes:true,
    commercial_eligible:false,
    accepted:[],
  };
}
function readBudget() {
  const x=spawnSync(process.execPath,[
    "scripts/ops/supabase-free-tier-budget.mjs",
    "--require-bulk-write","--require-normal",
  ],{encoding:"utf8",timeout:30_000,maxBuffer:128*1024,
    env:process.env});
  // A 78 indicates a *verified* Supabase freeze/headroom hold, not a
  // permission to downgrade it. Parse only its sanitized canonical stdout.
  if(x.error || ![0,78].includes(x.status))
    throw new Error("TELEGRAM_ADMISSION_SUPABASE_BUDGET_UNAVAILABLE");
  let state;
  try {state=JSON.parse(x.stdout.trim());}
  catch {throw new Error("TELEGRAM_ADMISSION_SUPABASE_BUDGET_INVALID");}
  requireTrue(state?.ok===true && (x.status===0 ?
    (state.mode==="normal"&&state.bulk_write_allowed===true) :
    (state.mode!=="normal"||state.bulk_write_allowed!==true)),
    "TELEGRAM_ADMISSION_SUPABASE_BUDGET_CONFLICT");
  return state;
}
export async function runTelegramConsumerAdmission({
  queueFile,stage,governor=null,now=new Date(),
}={}) {
  requireTrue(["queue","budget"].includes(stage)&&typeof queueFile==="string"&&
    queueFile.endsWith(".json"),"TELEGRAM_ADMISSION_MODE_INVALID");
  let source;
  try {source=JSON.parse(readFileSync(queueFile,"utf8"));}
  catch {throw new Error("TELEGRAM_ADMISSION_QUEUE_FILE_INVALID");}
  const pending=readTelegramConsumerQueue(source);
  if(stage==="queue") {
    const preliminary=evaluateTelegramConsumerAdmission({pending,now});
    return pending===0 ? preliminary :
      {...preliminary,status:"PENDING_QUEUE_AWAITING_BUDGET_CHECK"};
  }
  if(pending===0)return evaluateTelegramConsumerAdmission({pending,now});
  const supabase=readBudget();
  if(supabase.mode!=="normal"||supabase.bulk_write_allowed!==true)
    return evaluateTelegramConsumerAdmission({pending,supabase,now});
  const globalQuota=governor??createB2D1AccountGovernor();
  const quota=await globalQuota.status(); // READ-ONLY, NOT a ticket
  return evaluateTelegramConsumerAdmission({pending,supabase,quota,now});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try {
    const args=process.argv.slice(2);
    requireTrue(args.length===4&&args[0]==="--stage"&&
      ["queue","budget"].includes(args[1]) &&
      args[2]==="--queue-file"&&
      process.env.B2_ACCOUNT_QUOTA_REQUIRED==="1"&&
      process.env.B2_ACCOUNT_QUOTA_WORKFLOW_ID==="telegram_b2_d1_consumer"&&
      Boolean(process.env.GITHUB_OUTPUT),
      "TELEGRAM_ADMISSION_RUNNER_CONFIG_INVALID");
    const result=await runTelegramConsumerAdmission({
      stage:args[1],queueFile:args[3],
    });
    appendFileSync(process.env.GITHUB_OUTPUT,
      (args[1]==="queue"?"pending=":"can_consume=")+
      String(args[1]==="queue" ? result.pending_count>0 :
        result.can_consume)+"\n");
    if(args[1]==="budget"&&!result.can_consume || 
       args[1]==="queue"&&result.pending_count===0) {
      const dest="artifacts/telegram-lead-intake/verified/summary.json";
      mkdirSync(dirname(dest),{recursive:true,mode:0o700});
      writeFileSync(dest,JSON.stringify(noWorkSummary(result))+"\n",
        {mode:0o600});
    }
    console.log(JSON.stringify(cleanReceipt(result)));
  }catch(e) {
    const code=e instanceof Error&&/^TELEGRAM_ADMISSION_[A-Z0-9_]+$/u.test(e.message)
      ? e.message:"TELEGRAM_ADMISSION_FAILED_CLOSED";
    console.error(JSON.stringify({
      ok:false,error:code,
      can_consume:false,b2_requests:0,supabase_writes:0,usdc_spent:0,
    }));
    process.exitCode=1;
  }
}
