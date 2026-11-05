import {spawnSync} from "node:child_process";
import {ATOMIC_B2_QUOTA_SQL,B2_DAILY_LIMITS} from "../../workers/control-plane/src/b2-account-quota.mjs";
import {readCloudflareD1AccountQuota,D1_FREE_DAILY} from "./audit-d1-account-daily-quota-readonly.mjs";
const fail=code=>{throw Error(code)};
function sqlLiteral(v){if(typeof v==="number"&&Number.isFinite(v))return String(v);if(typeof v!=="string")fail("P0B_D1_SQL_VALUE_INVALID");return "'"+v.replaceAll("'","''")+"'";}
function bind(sql,values){let i=0;const out=sql.replace(/\?/gu,()=>sqlLiteral(values[i++]));if(i!==values.length||out.includes("?"))fail("P0B_D1_SQL_BINDING_INVALID");return out;}
function rowsOf(x){return (Array.isArray(x)?x:[x]).flatMap(v=>v?.results??v?.result?.results??[]);}
export function buildP0bNativeAuthTicketSql(now=new Date()){
 const iso=now.toISOString(),day=iso.slice(0,10);
 const increments=["GET","PUT","HEAD","NATIVE_AUTH"].map(k=>Number(k==="NATIVE_AUTH"));
 const quotaSql=bind(ATOMIC_B2_QUOTA_SQL,[day,...increments,iso,B2_DAILY_LIMITS.total,B2_DAILY_LIMITS.GET,B2_DAILY_LIMITS.PUT,B2_DAILY_LIMITS.HEAD,B2_DAILY_LIMITS.NATIVE_AUTH,0,B2_DAILY_LIMITS.GET]);
 const receiptSql="INSERT INTO b2_request_quota_workflow_receipt (day_utc,workflow_id,operation,requests,updated_at) VALUES ("+[day,"p0b_b2_scope_preflight","NATIVE_AUTH",1,iso].map(sqlLiteral).join(",")+") ON CONFLICT(day_utc,workflow_id,operation) DO UPDATE SET requests=requests+1,updated_at=excluded.updated_at";
 const readbackSql="SELECT requests FROM b2_request_quota_workflow_receipt WHERE day_utc="+sqlLiteral(day)+" AND workflow_id="+sqlLiteral("p0b_b2_scope_preflight")+" AND operation='NATIVE_AUTH' LIMIT 1";
 return {day,quotaSql,receiptSql,readbackSql};
}
export async function reserveP0bNativeAuthTicket({execute,now=new Date()}={}){
 if(typeof execute!=="function")fail("P0B_D1_EXECUTOR_UNAVAILABLE");
 const q=buildP0bNativeAuthTicketSql(now);
 const reserved=rowsOf(await execute(q.quotaSql))[0];
 if(!reserved||!Number.isSafeInteger(Number(reserved.total_requests))||Number(reserved.total_requests)<1||Number(reserved.native_auth_requests)<1)fail("P0B_B2_NATIVE_AUTH_D1_RESERVATION_REFUSED");
 await execute(q.receiptSql);
 const receipt=rowsOf(await execute(q.readbackSql))[0];
 if(!receipt||!Number.isSafeInteger(Number(receipt.requests))||Number(receipt.requests)<1)fail("P0B_B2_NATIVE_AUTH_D1_READBACK_FAILED");
 return {ok:true,reserved:true,day_utc:q.day,kind:"NATIVE_AUTH",readback_verified:true,b2_operation_performed:false,chargeable:false};
}
export function classifyP0bWranglerD1Failure(r){
 const spawnCode=String(r?.error?.code??"").toUpperCase();
 if(spawnCode==="ETIMEDOUT")return "TIMEOUT";
 if(spawnCode==="ENOENT")return "WRANGLER_EXECUTABLE_MISSING";
 if(spawnCode&&/^[A-Z0-9_]+$/u.test(spawnCode))return "SPAWN_"+spawnCode;
 const output=[r?.stderr,r?.stdout].filter(Boolean).join(" ")
  .replaceAll(String.fromCharCode(27),"");
 if(!output.trim()&&Number.isInteger(r?.status)&&r.status!==0)return "NO_OUTPUT";
 const text=output.toLowerCase();
 if(text.includes("your account has exceeded d1's free tier daily row read limit")&&
    text.includes("7500"))return "D1_DAILY_ROW_READ_LIMIT_7500";
 if(text.includes("your account has exceeded d1's free tier daily row write limit")&&
    text.includes("7500"))return "D1_DAILY_ROW_WRITE_LIMIT_7500";
 if(text.includes("no such table")||text.includes("no such column")||text.includes("sqlite_error")||text.includes("syntax error"))return "SQL";
 if(text.includes("permission")||text.includes("unauthorized")||text.includes("forbidden")||text.includes("authentication")||text.includes("not authorized"))return "AUTH";
 if(text.includes("database is locked")||text.includes("sqlite_busy")||text.includes("too many requests")||text.includes("rate limit")||text.includes("429"))return "TRANSIENT";
 if(text.includes("database not found")||text.includes("unknown database")||text.includes("no database")||text.includes("binding not found"))return "DATABASE";
 if(text.includes("unknown argument")||text.includes("invalid argument")||text.includes("unexpected argument"))return "CLI";
 if(text.includes("http 4")||text.includes("http 5")||text.includes("status code")||text.includes("error 100")||text.includes("request failed"))return "API";
 return "UNKNOWN";
}
export function safeP0bWranglerD1Hint(r,secrets=[]){
 let text=[r?.stderr,r?.stdout].filter(Boolean).join("\n")
  .replaceAll(String.fromCharCode(27),"");
 for(const secret of secrets)if(typeof secret==="string"&&secret.length>=8)text=text.replaceAll(secret,"[REDACTED]");
 text=text.replace(/Bearer\s+[^\s]+/giu,"Bearer [REDACTED]")
  .replace(/https?:\/\/[^\s)]+/giu,"[URL]")
  .replace(/\b[0-9a-f-]{36}\b/giu,"[ID]")
  .replace(/[A-Za-z0-9_./+=-]{40,}/gu,"[REDACTED]");
 const lines=text.split(/\r?\n/u).filter(line=>
  line.trim()&&!line.includes("--command")&&
  !/^\s*(node|npx)\s/u.test(line)&&
  !/\b(select|insert|update|returning)\b/iu.test(line));
 const errorLine=lines.find(line=>/(error|failed|denied|invalid|exception|not found)/iu.test(line));
 return (errorLine??lines[0]??"").trim().slice(0,140);
}
function executeRemote(sql){
 const config=String(process.env.P0B_QUOTA_WRANGLER_CONFIG??""),version=String(process.env.WRANGLER_VERSION??"");
 if(!config||!/^\d+\.\d+\.\d+$/u.test(version))fail("P0B_QUOTA_WRANGLER_CONFIG_MISSING");
 const r=spawnSync("npx",["-y","wrangler@"+version,"d1","execute","DB","--remote","--json","--config",config,"--command",sql],{encoding:"utf8",timeout:120000,maxBuffer:1024*1024});
 if(r.error||r.status!==0){
  const diagnostic=classifyP0bWranglerD1Failure(r);
  console.error("P0B_D1_WRANGLER_DIAGNOSTIC="+diagnostic);
  if(Number.isInteger(r.status))console.error("P0B_D1_WRANGLER_EXIT_STATUS="+r.status);
  const hint=safeP0bWranglerD1Hint(r,Object.values(process.env));
  if(hint)console.error("P0B_D1_WRANGLER_SAFE_HINT="+hint);
  fail("P0B_B2_NATIVE_AUTH_D1_EXECUTION_FAILED");
 }
 try{return JSON.parse(r.stdout)}catch{fail("P0B_B2_NATIVE_AUTH_D1_INVALID_JSON")}
}
// Provider GraphQL is independent of the D1 SQL path. A failed native-auth
// reservation cannot be retried as "quota exhausted" unless exact provider
// metrics confirm the account's daily read ceiling; unknown errors stay held.
export function verifiedP0bD1ReadQuotaExhaustion(proof){
 return proof?.provider_graphql_usage_observed===true &&
   proof?.limits?.rows_read===D1_FREE_DAILY.rows_read &&
   proof?.remaining_rows_read===0 &&
   Number.isSafeInteger(proof?.observed_rows_read) &&
   proof.observed_rows_read>=D1_FREE_DAILY.rows_read &&
   /^\\d{4}-\\d{2}-\\d{2}$/.test(proof?.day_utc??"");
}
if(process.argv[1]?.endsWith("/reserve-p0b-native-auth-ticket.mjs")){
 try{const x=await reserveP0bNativeAuthTicket({execute:async sql=>executeRemote(sql)});console.log("P0B_B2_NATIVE_AUTH_D1_RESERVATION_VERIFIED="+x.readback_verified);if(process.env.GITHUB_OUTPUT)await import("node:fs/promises").then(fs=>fs.appendFile(process.env.GITHUB_OUTPUT,"reserved=true\n"));}
 catch(e){
 const c=e instanceof Error?e.message:"";
 if(c==="P0B_B2_NATIVE_AUTH_D1_EXECUTION_FAILED"){
   try{
     const proof=await readCloudflareD1AccountQuota();
     console.error(verifiedP0bD1ReadQuotaExhaustion(proof)
       ?"P0B_D1_PROVIDER_ROW_READ_LIMIT_REACHED_VERIFIED"
       :"P0B_D1_PROVIDER_READ_LIMIT_NOT_CONFIRMED");
   }catch{console.error("P0B_D1_PROVIDER_QUOTA_METRICS_UNAVAILABLE");}
 }
 console.error(/^P0B_[A-Z0-9_]+$/u.test(c)?c:"P0B_B2_NATIVE_AUTH_D1_RESERVATION_FAILED");
 process.exitCode=1;
}
}