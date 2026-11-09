#!/usr/bin/env node
/**
 * Read-only, zero-funds provider diagnostic for the real isolated Shadow
 * database after migration 0204. It NEVER applies SQL migrations or returns
 * provider response text/private source rows. Not a migration acceptance.
 */
import {mkdtempSync,writeFileSync,mkdirSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {execFileSync} from "node:child_process";
import {step3IndexParityQueries,parseStep3IndexD1ReadOnly,
 verifyStep3IndexParity} from "../lib/d1-step3-index-parity.mjs";
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu;
const path="artifacts/release/step3-shadow-0204-readonly-diagnostic.json";
const checks=Object.freeze([
 ["native_migration_history","SELECT COUNT(*) AS matched FROM d1_migrations WHERE name='0204_d1_read_hotspot_optimization.sql'"],
 ["step3_0204_ledger","SELECT migration_id,status FROM _geomacro_migration_ledger WHERE migration_id='0204' LIMIT 1"],
 ["0204_index_schema","SELECT name FROM sqlite_schema WHERE type='index' AND name IN ('idx_private_osint_country_category_clock_v2','idx_private_osint_check_category_status_v2','idx_website_derived_hot_order_v2') ORDER BY name LIMIT 3"],
 ["osint_index_plan","EXPLAIN QUERY PLAN SELECT item_id FROM private_osint_news_25h INDEXED BY idx_private_osint_country_category_clock_v2 WHERE country_iso3='USA' AND category='geopolitics' ORDER BY native_feed_published_at DESC,item_id DESC LIMIT 1"],
 ["osint_full_integrity","PRAGMA integrity_check('private_osint_news_25h')"],
 ["source_check_full_integrity","PRAGMA integrity_check('private_osint_source_checks_24h')"],
 ["website_full_integrity","PRAGMA integrity_check('website_derived_intelligence')"],
 // Compatibility-only probes. A quick_check result NEVER substitutes for
 // full index parity or authorizes a production migration.
 ["osint_table_quick_check","PRAGMA quick_check('private_osint_news_25h')"],
 ["source_check_table_quick_check","PRAGMA quick_check('private_osint_source_checks_24h')"],
 ["website_table_quick_check","PRAGMA quick_check('website_derived_intelligence')"]
]);
export const SHADOW_0204_READONLY_QUERIES=checks;
export function safeCheckResult(name,exitCode,data){
 const valid=Array.isArray(data)&&data.length===1&&data[0]?.success===true&&
  Array.isArray(data[0].results)&&
  Number.isSafeInteger(data[0]?.meta?.rows_read)&&
  data[0].meta.rows_written===0;
 if(!valid||exitCode!==0)return {check:name,kind:"HOLD",exit_code:exitCode};
 const rows=data[0].results;
 const x={check:name,kind:"OBSERVED_READ_ONLY",returned_rows:rows.length,
   provider_rows_read:data[0].meta.rows_read,provider_rows_written:0};
 if(name==="native_migration_history")x.native_history_exact_row_count=
  Number.isSafeInteger(rows[0]?.matched)?rows[0].matched:null;
 if(name==="step3_0204_ledger")x.status=
  ["STARTED","APPLIED","VERIFIED"].includes(rows[0]?.status)?
  rows[0].status:"UNKNOWN_OR_ABSENT";
 if(name==="0204_index_schema")x.index_names=rows
  .map(r=>r.name).filter(n=>/^(?:idx_private_osint_country_category_clock_v2|idx_private_osint_check_category_status_v2|idx_website_derived_hot_order_v2)$/u.test(n));
 const exactOk=rows.length===1&&Object.values(rows[0]).length===1&&
  Object.values(rows[0])[0]==="ok";
 if(name.endsWith("_full_integrity"))x.full_integrity_exact_ok=exactOk;
 if(name.endsWith("_table_quick_check"))x.quick_check_exact_ok=exactOk;
 return x;
}
export function validateReadonlyCommands(list=checks){
 if(!Array.isArray(list)||list.length!==10)return false;
 return list.every(([name,sql])=>
  /^[a-z0-9_]{3,50}$/u.test(name)&&
  /^(?:SELECT |EXPLAIN QUERY PLAN SELECT |PRAGMA (?:integrity_check|quick_check)\(')/u.test(sql)&&
  !/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|ATTACH|VACUUM|REINDEX|PRAGMA\s+\w+\s*=)\b/iu.test(sql)&&
  sql.length<500);
}
function main(env=process.env){
 if(!validateReadonlyCommands()||env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
  env.GITHUB_REF!=="refs/heads/main"||
  env.GITHUB_EVENT_NAME!=="push"||
  !UUID.test(env.GEOMACRO_D1_SHADOW_DATABASE_ID??"")||
  !UUID.test(env.D1_DATABASE_ID??"")||
  env.GEOMACRO_D1_SHADOW_DATABASE_ID.toLowerCase()===
   env.D1_DATABASE_ID.toLowerCase()||
  (env.CLOUDFLARE_API_TOKEN??"").length<20)
  throw Error("STEP3_SHADOW_READONLY_SCOPE_UNVERIFIED");
 const dir=mkdtempSync(join(tmpdir(),"geomacro-shadow-0204-readonly-"));
 const config=join(dir,"wrangler.jsonc");
 writeFileSync(config,JSON.stringify({name:"geomacro-shadow-0204-readonly",
  compatibility_date:"2026-10-03",d1_databases:[{binding:"DB",
   database_name:"geomacro-d1-publisher-shadow",
   database_id:env.GEOMACRO_D1_SHADOW_DATABASE_ID}]}),{mode:0o600});
 const out={schema:"geomacro.step3-shadow-0204-readonly-observation.v1",
  code:"DIAGNOSTIC_ONLY_NO_MIGRATION_OR_PAYMENT",
  github_sha:env.GITHUB_SHA,
  cloudflare_target:"SHADOW_ONLY",
  production_sql_mutated:false,
  payments:0,canary_promoted:false,checks:[]};
 for(const [name,sql] of checks){
  let result;
  try{
   const raw=execFileSync("npx",["-y","wrangler@4.136.3",
    "d1","execute","DB","--remote","--json","--command",sql,
    "--config",config],{encoding:"utf8",timeout:45000,
    maxBuffer:500000,stdio:["ignore","pipe","pipe"]});
   result=safeCheckResult(name,0,JSON.parse(raw));
  }catch(e){
   // No raw stderr or stdout: they may contain provider details.
   result={check:name,kind:"PROVIDER_COMMAND_FAILED",
    exit_code:Number.isInteger(e?.status)&&e.status>=0&&e.status<=255?
     e.status:null,timeout:e?.code==="ETIMEDOUT"};
  }
  out.checks.push(result);
 }
 // Verify every row/key of each 0204 *new* index against two independent
 // NOT INDEXED full-table snapshots. A forced covering index scan is mandatory.
 // Private rows and digest values stay in runner memory: receipt has only enums.
 const indexes=[
  "idx_private_osint_country_category_clock_v2",
  "idx_private_osint_check_category_status_v2",
  "idx_website_derived_hot_order_v2"
 ];
 let providerRowsRead=0;
 const readSQL=(sql,cap=3001)=>{
  const raw=execFileSync("npx",["-y","wrangler@4.136.3",
   "d1","execute","DB","--remote","--json","--command",sql,
   "--config",config],{encoding:"utf8",timeout:60000,
   maxBuffer:4_000_000,stdio:["ignore","pipe","pipe"]});
  const verified=parseStep3IndexD1ReadOnly(raw,cap);
  providerRowsRead+=verified.rowsRead;
  if(providerRowsRead>100000)throw Error("STEP3_INDEX_PARITY_OPERATIONAL_READ_CAP_EXCEEDED");
  return verified.rows;
 };
 out.index_parity_checks=[];
 for(const index of indexes){
  try{
   const queries=step3IndexParityQueries(index);
   const baselinePlan=readSQL(queries.baselinePlanSQL,20);
   const indexPlan=readSQL(queries.indexedPlanSQL,20);
   const baselineBefore=readSQL(queries.baselineSQL);
   const indexRows=readSQL(queries.indexedSQL);
   const baselineAfter=readSQL(queries.baselineSQL);
   const proof=verifyStep3IndexParity({index,baselineBefore,indexRows,baselineAfter,
    baselinePlan,indexPlan});
   out.index_parity_checks.push(proof);
  }catch(e){
   // Never report actual queries, private row values, source content or stderr.
   const code=/^STEP3_INDEX_PARITY_[A-Z0-9_]{3,110}$/u.test(e?.message??"")?
    e.message:"STEP3_INDEX_PARITY_PROVIDER_READ_UNVERIFIED";
   out.index_parity_checks.push({index,status:"HOLD",code,
    private_row_material_exposed:false,production_sql_mutated:false});
  }
 }
 out.index_parity_provider_rows_read=providerRowsRead;
 out.index_parity_bounded_0204_PASS=out.index_parity_checks.length===3&&
  out.index_parity_checks.every(x=>x.status===
   "PASS_BOUNDED_FULL_LOGICAL_INDEX_KEY_PARITY");
 out.sqlite_full_integrity_check_claimed=false;
 mkdirSync(resolve(path,".."),{recursive:true,mode:0o700});
 writeFileSync(path,JSON.stringify(out,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify({code:out.code,checks:out.checks,
  receipt:path,production_sql_mutated:false}));
}
if(process.argv[1]&&process.argv[1].endsWith("step3-shadow-0204-readonly-diagnostic.mjs"))
 main();
