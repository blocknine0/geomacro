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
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu;
const path="artifacts/release/step3-shadow-0204-readonly-diagnostic.json";
const checks=Object.freeze([
 ["native_migration_history","SELECT COUNT(*) AS matched FROM d1_migrations WHERE name='0204_d1_read_hotspot_optimization.sql'"],
 ["step3_0204_ledger","SELECT migration_id,status FROM _geomacro_migration_ledger WHERE migration_id='0204' LIMIT 1"],
 ["0204_index_schema","SELECT name FROM sqlite_schema WHERE type='index' AND name IN ('idx_private_osint_country_category_clock_v2','idx_private_osint_check_category_status_v2','idx_website_derived_hot_order_v2') ORDER BY name LIMIT 3"],
 ["osint_index_plan","EXPLAIN QUERY PLAN SELECT item_id FROM private_osint_news_25h INDEXED BY idx_private_osint_country_category_clock_v2 WHERE country_iso3='USA' AND category='geopolitics' ORDER BY native_feed_published_at DESC,item_id DESC LIMIT 1"],
 ["osint_full_integrity","PRAGMA integrity_check('private_osint_news_25h')"],
 ["source_check_full_integrity","PRAGMA integrity_check('private_osint_source_checks_24h')"],
 ["website_full_integrity","PRAGMA integrity_check('website_derived_intelligence')"]
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
 if(name.endsWith("_full_integrity"))x.full_integrity_exact_ok=
  rows.length===1&&Object.values(rows[0]).length===1&&
  Object.values(rows[0])[0]==="ok";
 return x;
}
export function validateReadonlyCommands(list=checks){
 if(!Array.isArray(list)||list.length!==7)return false;
 return list.every(([name,sql])=>
  /^[a-z0-9_]{3,50}$/u.test(name)&&
  /^(?:SELECT |EXPLAIN QUERY PLAN SELECT |PRAGMA integrity_check\(')/u.test(sql)&&
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
 mkdirSync(resolve(path,".."),{recursive:true,mode:0o700});
 writeFileSync(path,JSON.stringify(out,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify({code:out.code,checks:out.checks,
  receipt:path,production_sql_mutated:false}));
}
if(process.argv[1]&&process.argv[1].endsWith("step3-shadow-0204-readonly-diagnostic.mjs"))
 main();
