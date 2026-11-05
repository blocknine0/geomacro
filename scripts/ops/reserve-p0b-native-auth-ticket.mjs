import {spawnSync} from "node:child_process";
import {ATOMIC_B2_QUOTA_SQL,B2_DAILY_LIMITS} from "../../workers/control-plane/src/b2-account-quota.mjs";
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
 if(r?.error?.code==="ETIMEDOUT")return "TIMEOUT";
 if(r?.error?.code==="ENOENT")return "WRANGLER_EXECUTABLE_MISSING";
 const text=[r?.stderr,r?.stdout].filter(Boolean).join("\\n")
  .replace(/\\u001b\\[[0-9;]*m/gu,"").toLowerCase();
 if(/no such table|no such column|sqlite_error|syntax error/u.test(text))return "SQL";
 if(/permission|unauthorized|forbidden|authentication|not authorized/u.test(text))return "AUTH";
 if(/database is locked|sqlite_busy|too many requests|rate limit|\\b429\\b/u.test(text))return "TRANSIENT";
 if(/database.*not found|unknown database|no database|binding.*not found|not_found/u.test(text))return "DATABASE";
 if(/unknown argument|invalid argument|unexpected argument/u.test(text))return "CLI";
 if(/http \\d{3}|status code \\d{3}|error \\d{4,}|request failed/u.test(text))return "API";
 return "UNKNOWN";
}
function executeRemote(sql){
 const config=String(process.env.P0B_QUOTA_WRANGLER_CONFIG??""),version=String(process.env.WRANGLER_VERSION??"");
 if(!config||!/^\d+\.\d+\.\d+$/u.test(version))fail("P0B_QUOTA_WRANGLER_CONFIG_MISSING");
 const r=spawnSync("npx",["-y","wrangler@"+version,"d1","execute","DB","--remote","--json","--config",config,"--command",sql],{encoding:"utf8",timeout:120000,maxBuffer:1024*1024});
 if(r.error||r.status!==0){
  const diagnostic=classifyP0bWranglerD1Failure(r);
  console.error("P0B_D1_WRANGLER_DIAGNOSTIC="+diagnostic);
  if(Number.isInteger(r.status))console.error("P0B_D1_WRANGLER_EXIT_STATUS="+r.status);
  fail("P0B_B2_NATIVE_AUTH_D1_EXECUTION_FAILED");
 }
 try{return JSON.parse(r.stdout)}catch{fail("P0B_B2_NATIVE_AUTH_D1_INVALID_JSON")}
}
if(process.argv[1]?.endsWith("/reserve-p0b-native-auth-ticket.mjs")){
 try{const x=await reserveP0bNativeAuthTicket({execute:async sql=>executeRemote(sql)});console.log("P0B_B2_NATIVE_AUTH_D1_RESERVATION_VERIFIED="+x.readback_verified);if(process.env.GITHUB_OUTPUT)await import("node:fs/promises").then(fs=>fs.appendFile(process.env.GITHUB_OUTPUT,"reserved=true\n"));}
 catch(e){const c=e instanceof Error?e.message:"";console.error(/^P0B_[A-Z0-9_]+$/u.test(c)?c:"P0B_B2_NATIVE_AUTH_D1_RESERVATION_FAILED");process.exitCode=1}
}