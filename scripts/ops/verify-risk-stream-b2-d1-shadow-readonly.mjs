#!/usr/bin/env node
// Safe read-only fallback when public production Worker domain is unavailable.
// Confirms the shared Cloudflare D1 B2 ledger within reviewed code limits,
// NOT live deployed Worker parity or provider Backblaze account usage.
import {spawnSync} from "node:child_process";
import {B2_DAILY_LIMITS} from "../../workers/control-plane/src/b2-account-quota.mjs";
const run=spawnSync("npx",["-y","wrangler@4.136.3","d1","execute",
 "geomacro-control-plane","--remote","--json","--command",
 "SELECT day_utc,total_requests,get_requests,put_requests,head_requests,"+
 "native_auth_requests FROM b2_account_daily_request_quota WHERE "+
 "day_utc=strftime('%Y-%m-%d','now') LIMIT 1"],{
 encoding:"utf8",timeout:45000,maxBuffer:500000,env:process.env});
if(run.status!==0)throw Error("B2_SHADOW_SHARED_LEDGER_D1_UNAVAILABLE");
const result=JSON.parse(run.stdout);
if(!Array.isArray(result)||result[0]?.success!==true||
   !Array.isArray(result[0].results))
 throw Error("B2_SHADOW_SHARED_LEDGER_D1_RECEIPT_INVALID");
const db=result[0].results[0]||{};
const used={total:db.total_requests??0,GET:db.get_requests??0,
 PUT:db.put_requests??0,HEAD:db.head_requests??0,
 NATIVE_AUTH:db.native_auth_requests??0};
const keys=Object.keys(used);
if(keys.some(k=>!Number.isSafeInteger(used[k])||used[k]<0||
  used[k]>B2_DAILY_LIMITS[k]))throw Error("B2_SHADOW_LEDGER_QUOTA_DRIFT_OR_EXHAUSTED");
console.log(JSON.stringify({schema:"geomacro.shadow-b2-d1-readonly.v1",
 status:"D1_SHARED_LEDGER_WITHIN_CODE_LIMITS",
 day_utc:new Date().toISOString().slice(0,10),used,
 reviewed_code_limits:B2_DAILY_LIMITS,
 live_control_plane_worker_parity:"UNKNOWN_DNS_HOLD",
 provider_backblaze_counters:"NOT_VERIFIED",
 shadow_b2_network_calls:0,commercial_release_authorized:false}));
