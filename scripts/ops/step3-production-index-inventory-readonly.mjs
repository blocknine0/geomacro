#!/usr/bin/env node
/** Protected, read-only production D1 index inventory. D1 /query uses HTTP POST for SELECT. */
import {createHash} from "node:crypto";
import {mkdirSync,writeFileSync,existsSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
const DB="db057ca9-9f6e-4957-ac28-144f3b798f9b";
const ACCOUNT=/^[a-f0-9]{32}$/u,SHA=/^[a-f0-9]{40}$/u;
const ID=/^[A-Za-z_][A-Za-z0-9_]{0,95}$/u;
const TABLES=["private_osint_news_25h","private_osint_source_checks_24h","website_derived_intelligence"];
export const INDEX_SQL="SELECT tbl_name,name,sql FROM sqlite_schema WHERE type='index' AND tbl_name IN ('private_osint_news_25h','private_osint_source_checks_24h','website_derived_intelligence') ORDER BY tbl_name,name LIMIT 150";
export const HISTORY_SQL="SELECT id,name FROM d1_migrations WHERE name LIKE '0119_%' OR name LIKE '0204_%' OR name LIKE '0211_%' OR name LIKE '0212_%' OR name LIKE '0213_%' ORDER BY id LIMIT 20";
const fail=reason=>{throw Error("STEP3_INDEX_INVENTORY_"+reason)};
export function sanitizeIndexInventory(indexRows,historyRows,metadata,sourceSha){
 if(!SHA.test(sourceSha??"")||!Array.isArray(indexRows)||indexRows.length>150||
    !Array.isArray(historyRows)||historyRows.length>20||
    !Array.isArray(metadata)||metadata.length!==2)
  fail("RESULT_SCOPE_UNVERIFIED");
 const totals=Object.fromEntries(TABLES.map(t=>[t,0]));
 const indexes=[];let prev="";
 for(const r of indexRows){
  if(!r||Object.keys(r).sort().join(",")!=="name,sql,tbl_name"||
     !TABLES.includes(r.tbl_name)||!ID.test(r.name??"")||
     (r.sql!==null&&(typeof r.sql!=="string"||r.sql.length>4000)))
   fail("INDEX_ROW_UNVERIFIED");
  const key=r.tbl_name+"|"+r.name;
  if(prev>=key)fail("INDEX_ORDER_OR_DUPLICATE");
  prev=key;totals[r.tbl_name]++;
  indexes.push({table:r.tbl_name,name:r.name,
   ddl_sha256:r.sql===null?null:createHash("sha256").update(r.sql).digest("hex"),
   reviewed_0119_ddl:r.name==="idx_website_risk_raw_source_scan"?r.sql:null});
 }
 const history=[];let id=0;
 for(const r of historyRows){
  if(!r||!Number.isSafeInteger(r.id)||r.id<=id||
     !/^(?:0119|0204|0211|0212|0213)_[a-z0-9_]+\.sql$/u.test(r.name??""))
   fail("NATIVE_HISTORY_UNVERIFIED");
  id=r.id;history.push({id:r.id,name:r.name});
 }
 let reads=0;
 for(const meta of metadata){
  if(!Number.isSafeInteger(meta?.rows_read)||meta.rows_read<0||
     meta.rows_read>5000||meta.rows_written!==0||
     (meta.changes!==undefined&&meta.changes!==0))
   fail("PROVIDER_METERED_READ_ONLY_UNVERIFIED");
  reads+=meta.rows_read;
 }
 return {schema:"geomacro.step3.production-index-inventory-readonly.v1",
  status:"OBSERVED_PROVIDER_READ_ONLY",source_sha:sourceSha,
  expected_database_id:DB,tables:totals,total_indexes:indexes.length,
  indexes,native_migration_history:history,provider_rows_read:reads,
  provider_rows_written:0,sql_whitelist_sha256:[INDEX_SQL,HISTORY_SQL]
   .map(s=>createHash("sha256").update(s).digest("hex")),
  production_migrations_applied_by_this_job:0,
  integrity_acceptance_not_inferred:true,canary_hold_removed:false,
  payments_activated:false};
}
export async function inspectProductionIndexInventory({env=process.env,fetchImpl=fetch,holdExists=existsSync}={}){
 if(env.GITHUB_ACTIONS!=="true"||env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    env.GITHUB_REF!=="refs/heads/main"||!SHA.test(env.GITHUB_SHA??"")||
    !ACCOUNT.test(env.CLOUDFLARE_ACCOUNT_ID??"")||
    env.D1_DATABASE_ID!==DB||
    typeof env.CLOUDFLARE_API_TOKEN!=="string"||
    env.CLOUDFLARE_API_TOKEN.length<20||
    !holdExists("config/d1-hotspot-v2-canary.hold"))
  fail("PROTECTED_SCOPE_OR_HOLD_UNVERIFIED");
 const uri="https://api.cloudflare.com/client/v4/accounts/"+
  env.CLOUDFLARE_ACCOUNT_ID+"/d1/database/"+DB+"/query";
 const query=async(sql,maxRows)=>{
  let response,body;
  try{
   response=await fetchImpl(uri,{
    method:"POST",redirect:"error",signal:AbortSignal.timeout(20000),
    headers:{"Authorization":"Bearer "+env.CLOUDFLARE_API_TOKEN,
     "Content-Type":"application/json","Cache-Control":"no-store"},
    body:JSON.stringify({sql,params:[]})});
   if(response?.status!==200||response?.redirected)
    fail("PROVIDER_AUTH_OR_HTTP_UNVERIFIED");
   body=await response.json();
  }catch(e){
   if(/^STEP3_INDEX_INVENTORY_/.test(e?.message??""))throw e;
   fail("PROVIDER_QUERY_UNAVAILABLE");
  }
  const batch=body?.result?.[0];
  if(body?.success!==true||!Array.isArray(body.result)||body.result.length!==1||
     batch?.success!==true||!Array.isArray(batch.results)||
     batch.results.length>maxRows)
   fail("PROVIDER_RESPONSE_UNVERIFIED");
  return batch;
 };
 const indexes=await query(INDEX_SQL,150),history=await query(HISTORY_SQL,20);
 return sanitizeIndexInventory(indexes.results,history.results,
  [indexes.meta,history.meta],env.GITHUB_SHA);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  if(process.argv.length!==2)fail("UNREVIEWED_ARGUMENTS");
  const result=await inspectProductionIndexInventory();
  const path="artifacts/release/step3-production-index-inventory-readonly.json";
  mkdirSync("artifacts/release",{recursive:true,mode:0o700});
  writeFileSync(path,JSON.stringify(result,null,2)+"\n",{mode:0o600});
  console.log(JSON.stringify({status:result.status,source_sha:result.source_sha,
   tables:result.tables,indexes:result.indexes,
   history:result.native_migration_history,
   rows_read:result.provider_rows_read,rows_written:result.provider_rows_written,
   report:path,no_funds:true,canary_hold_removed:false}));
 }catch(e){
  const code=/^STEP3_INDEX_INVENTORY_[A-Z0-9_]+$/u.test(e?.message??"")?
   e.message:"STEP3_INDEX_INVENTORY_UNCLASSIFIED_HOLD";
  console.error(JSON.stringify({status:"HOLD",code,d1_writes:0,
   canary_hold_removed:false,payments_activated:false}));
  process.exitCode=2;
 }
}
