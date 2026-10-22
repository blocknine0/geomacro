#!/usr/bin/env node
// Private 14-table customer/entitlement/credential/payment snapshot parity.
// Deliberately SHADOW ONLY: no live auth activation, no funds or old writes.
// SQL stays within protected runner and private Cloudflare D1; public artifacts
// receive only counts and failure categories. Never emit customer row contents.
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdirSync,writeFileSync} from "node:fs";
const REF="ldpwajisioljyjtojvfx";
const REPORT="artifacts/legacy-exit/customer-d1-private-shadow.json";
const TABLES=Object.freeze([
 "agent_payments","commercial_api_credential_lifecycle_events",
 "commercial_api_credentials","commercial_credit_accounts",
 "commercial_credit_usage","commercial_entitlement_grants",
 "commercial_payment_events","commercial_principals",
 "testnet_api_request_bindings","testnet_developer_credentials",
 "testnet_tester_profiles","testnet_tester_sessions",
 "testnet_usdc_payment_claims","testnet_wallet_challenges",
]);
const result={schema:"geomacro.legacy-customer-private-d1-shadow.v1",
 source_project:REF,status:"BLOCKED_NO_DELETION",
 historical_database_restore_verified:true,
 d1_shadow_parity_verified:false,
 live_customer_auth_cutover_verified:false,
 live_testnet_avatar_upload_cutover_verified:false,
 live_commercial_entitlement_cutover_verified:false,
 live_predge_cutover_verified:false,
 source_supabase_writes:0,source_supabase_deletes:0,
 real_payment_operations:0,old_supabase_deletion_authorized:false};
function emit(reason){
 result.reason=reason;
 mkdirSync("artifacts/legacy-exit",{recursive:true});
 writeFileSync(REPORT,JSON.stringify(result,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify(result));
}
function stop(reason){emit(reason);process.exitCode=3}
const sha=value=>createHash("sha256").update(value).digest("hex");
function dbConfig(s){
 try{
  const u=new URL(s),user=decodeURIComponent(u.username);
  if(!["postgres:","postgresql:"].includes(u.protocol)||!u.password||
     u.pathname!=="/postgres"||u.search||u.hash||
     !(u.hostname==="db."+REF+".supabase.co"&&user==="postgres"||
       u.hostname.endsWith(".pooler.supabase.com")&&user==="postgres."+REF))
    return null;
  return {host:u.hostname,port:u.port||"5432",user,password:decodeURIComponent(u.password)};
 }catch{return null}
}
const env=process.env;
function snapshot(db){
 const expressions=TABLES.map(table=>"'"+table+"',(SELECT coalesce(json_agg(to_json(x) ORDER BY x.id),'[]'::json) FROM public."+table+" x)");
 const sql="SELECT json_build_object("+expressions.join(",")+")::text;";
 const run=spawnSync("psql",["-h",db.host,"-p",db.port,"-U",db.user,"-d","postgres",
   "-X","-qAt","-v","ON_ERROR_STOP=1","-c",sql],{
  env:{...env,PGPASSWORD:db.password,PGSSLMODE:"require",PGCONNECT_TIMEOUT:"15"},
  encoding:"utf8",maxBuffer:15_000_000,timeout:60000,stdio:["ignore","pipe","pipe"]});
 if(run.error||run.status!==0||run.stdout.length>12_000_000)return null;
 try{
  const parsed=JSON.parse(run.stdout.trim());
  if(Object.keys(parsed).length!==TABLES.length)return null;
  for(const table of TABLES){
   const rows=parsed[table];
   if(!Array.isArray(rows)||rows.length>2000||
      rows.some(r=>!r||typeof r.id!=="string"||!/^[a-f0-9-]{36}$/i.test(r.id))||
      new Set(rows.map(x=>x.id)).size!==rows.length)return null;
  }
  return parsed;
 }catch{return null}
}
async function cf(path,body=null){
 const u="https://api.cloudflare.com/client/v4/accounts/"+env.CLOUDFLARE_ACCOUNT_ID+path;
 const response=await fetch(u,{method:body?"POST":"GET",
  headers:{Authorization:"Bearer "+env.CLOUDFLARE_API_TOKEN,
   ...(body?{"Content-Type":"application/json"}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),
  redirect:"error",signal:AbortSignal.timeout(35000)});
 const parsed=await response.json().catch(()=>null);
 if(!response.ok||parsed?.success!==true)throw Error("PRIVATE_CLOUDFLARE_D1_REQUEST_FAILED");
 return parsed;
}
async function main(){
 if(env.APP_SUPABASE_URL!=="https://"+REF+".supabase.co"||
    !/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID??"")||
    !env.CLOUDFLARE_API_TOKEN)return stop("PINNED_OLD_SOURCE_OR_CLOUDFLARE_CONFIG_REQUIRED");
 const db=dbConfig(env.SUPABASE_DB_URL??"");
 if(!db)return stop("OLD_SOURCE_DB_IDENTITY_NOT_PINNED");
 const data=snapshot(db);
 if(!data)return stop("READ_ONLY_CUSTOMER_SNAPSHOT_UNAVAILABLE");
 const records=TABLES.flatMap(table=>data[table].map(row=>{
  const content=JSON.stringify(row);
  return {table,id:row.id,content,hash:sha(content)};
 }));
 if(records.length<20||records.length>3500||
    records.reduce((n,x)=>n+x.content.length,0)>9_000_000)
  return stop("CUSTOMER_SHADOW_SNAPSHOT_SCOPE_INVALID");
 const snapshotHash=sha(JSON.stringify(records.map(({table,id,hash})=>[table,id,hash])));
 const list=await cf("/d1/database?per_page=100");
 const candidates=list.result?.filter(x=>x.name==="geomacro-control-plane");
 const id=candidates?.length===1?candidates[0].uuid:null;
 if(!/^[a-f0-9-]{36}$/i.test(id??""))return stop("PINNED_CUSTOMER_SHADOW_D1_NOT_FOUND");
 const query=async(sql,params=[])=>{
  const body=await cf("/d1/database/"+id+"/query",{sql,params});
  const inner=body.result?.[0];
  if(inner?.success!==true)throw Error("CUSTOMER_D1_QUERY_NOT_ACCEPTED");
  return inner.results??[];
 };
 // Separate, private tables; NO public Worker endpoints are added.
 await query("CREATE TABLE IF NOT EXISTS legacy_customer_private_shadow("+
  "snapshot_hash TEXT NOT NULL, source_table TEXT NOT NULL, row_id TEXT NOT NULL,"+
  "private_row_json TEXT NOT NULL, row_sha256 TEXT NOT NULL,"+
  " PRIMARY KEY(snapshot_hash,source_table,row_id))");
 await query("CREATE TABLE IF NOT EXISTS legacy_customer_private_shadow_receipts("+
  "snapshot_hash TEXT PRIMARY KEY, source_project TEXT NOT NULL,"+
  "row_count INTEGER NOT NULL, table_count INTEGER NOT NULL, checked_at TEXT NOT NULL)");
 // Protected batch bindings, never construct SQL using source values.
 // Snapshot id is immutable, so repeat runs are idempotent.
 for(let offset=0;offset<records.length;offset+=20){
  const part=records.slice(offset,offset+20);
  const placeholders=part.map(()=>" (?,?,?,?,?)").join(",");
  const params=part.flatMap(x=>[snapshotHash,x.table,x.id,x.content,x.hash]);
  await query("INSERT OR IGNORE INTO legacy_customer_private_shadow("+
   "snapshot_hash,source_table,row_id,private_row_json,row_sha256) VALUES"+
   placeholders,params);
 }
 const rest=await query("SELECT source_table,row_id,row_sha256,private_row_json "+
   "FROM legacy_customer_private_shadow WHERE snapshot_hash=? ORDER BY source_table,row_id",
   [snapshotHash]);
 const actual=rest.map(r=>[r.source_table,r.row_id,r.row_sha256,sha(r.private_row_json)]);
 const expected=records.map(x=>[x.table,x.id,x.hash,x.hash]);
 const by=(a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b));
 actual.sort(by);expected.sort(by);
 if(actual.length!==records.length||JSON.stringify(actual)!==JSON.stringify(expected))
   return stop("CUSTOMER_D1_PRIVATE_ROW_BYTES_AND_HASH_PARITY_FAILED");
 // Catch concurrent source credential revocations, payments or grants.
 const after=snapshot(db);
 if(!after||sha(JSON.stringify(after))!==sha(JSON.stringify(data)))
   return stop("SOURCE_CUSTOMER_ROWS_CHANGED_DURING_TRANSFER_RETRY_REQUIRED");
 await query("INSERT OR IGNORE INTO legacy_customer_private_shadow_receipts "+
  "(snapshot_hash,source_project,row_count,table_count,checked_at) VALUES (?,?,?,?,?)",
  [snapshotHash,REF,String(records.length),String(TABLES.length),new Date().toISOString()]);
 const proof=await query("SELECT row_count,table_count FROM "+
  "legacy_customer_private_shadow_receipts WHERE snapshot_hash=?",[snapshotHash]);
 if(proof.length!==1||Number(proof[0].row_count)!==records.length||
   Number(proof[0].table_count)!==TABLES.length)
   return stop("CUSTOMER_PRIVATE_D1_RECEIPT_NOT_ACCEPTED");
 result.status="PRIVATE_D1_CUSTOMER_SHADOW_RESTORED_PARITY_VERIFIED";
 result.d1_shadow_parity_verified=true;
 result.snapshot_fingerprint_prefix=snapshotHash.slice(0,12);
 result.protected_tables=TABLES.length;result.protected_rows=records.length;
 result.table_row_counts=Object.fromEntries(TABLES.map(k=>[k,data[k].length]));
 emit("LIVE_AUTH_SESSION_LEDGER_AND_PAYMENT_RUNTIME_CUTOVER_NOT_ACTIVATED");
}
try{await main()}catch{stop("PRIVATE_CUSTOMER_SHADOW_TRANSFER_OR_READBACK_FAILED")}
