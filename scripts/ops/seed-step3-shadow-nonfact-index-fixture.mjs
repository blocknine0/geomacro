#!/usr/bin/env node
/**
 * Explicitly approved, isolated Shadow-only NON-FACT fixture for physical
 * 0204 index parity. Never real news, rights evidence, GRO or commercial data.
 * Protected signed encrypted recovery checkpoint BEFORE any D1 mutation.
 */
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,existsSync} from "node:fs";
import {join,resolve} from "node:path";
import {tmpdir} from "node:os";
import {execFileSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import {checkD1PaidMonthlyHeadroom} from "../lib/d1-workers-paid-monthly-governor.mjs";
import {captureDurableD1Checkpoint,signStep3StatusReceipt}
 from "../lib/d1-step3-recovery-checkpoint.mjs";
const SHA=/^[a-f0-9]{40}$/u;
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu;
const ACCOUNT=/^[a-f0-9]{32}$/iu;
const REPORT="artifacts/release/step3-shadow-index-nonfact-fixture.json";
const HOLD="config/d1-hotspot-v2-canary.hold";
const fixedTime="2000-01-01T00:00:00.000Z";
const categories=["geopolitics","macro","rare_earth"];
const sha=x=>createHash("sha256").update(x).digest("hex");
const quote=x=>"'"+String(x).replaceAll("'","''")+"'";
const fail=x=>{throw Error("STEP3_SHADOW_FIXTURE_"+x);};
function makeFixtures(){
 const news=categories.map((category,i)=>({
  item_id:sha("geomacro-step3-shadow-index-NONFACT-news-v1-"+i),
  category,country_iso3:["USA","IND",null][i],
  native_feed_published_at:"2000-01-0"+(i+1)+"T00:00:00.000Z",
  projection_json:JSON.stringify({
   schema:"geomacro.shadow-only-nonfact-index-fixture.v1",
   synthetic_test_data:true,not_source_evidence:true,
   risk_gate_eligible:false,commercial_eligible:false,
   no_source_or_event_claim:true,padding:"x".repeat(460)}),
  first_seen_at:fixedTime,last_seen_at:fixedTime,
  verification_status:"NATIVE_FEED_OBSERVED_ORIGINAL_PAGE_UNVERIFIED"
 }));
 const checks=categories.map((category,i)=>({
  source_ref:sha("geomacro-step3-shadow-index-NONFACT-source-v1-"+i),
  category,state:["NOT_DUE","EMPTY_OR_OUTSIDE_WINDOW","UNAVAILABLE"][i],
  checked_at:"2000-01-0"+(i+1)+"T00:00:00.000Z"
 }));
 const website=categories.map((category,i)=>({
  id:"st3shadow0204fix0"+(i+1),
  category,published_at:"2000-01-0"+(i+1)+"T00:00:00.000Z",
  date_precision:"exact",
  story_json:JSON.stringify({schema:"geomacro.shadow-only-nonfact-index-fixture.v1",
   synthetic_test_data:true,not_an_original_news_story:true,
   rights_approved:false,qualified:false,
   details:"isolated Shadow-only index key integrity test "+("x".repeat(125))}),
  first_seen_at:fixedTime
 }));
 return Object.freeze([
  {name:"private_osint_news_25h",key:"item_id",
   columns:["item_id","category","country_iso3","native_feed_published_at",
    "projection_json","first_seen_at","last_seen_at","verification_status"],rows:news},
  {name:"private_osint_source_checks_24h",key:"source_ref",
   columns:["source_ref","category","state","checked_at"],rows:checks},
  {name:"website_derived_intelligence",key:"id",
   columns:["id","category","published_at","date_precision","story_json","first_seen_at"],
   rows:website}
 ]);
}
export const STEP3_SHADOW_NONFACT_FIXTURES=makeFixtures();
export function assertShadowNonfactPlan(fixtures=STEP3_SHADOW_NONFACT_FIXTURES){
 if(fixtures.length!==3||fixtures.some(f=>f.rows.length!==3||
  f.rows.some(r=>r.category!==categories[f.rows.indexOf(r)])||
  f.rows.some(r=>r.first_seen_at&&r.first_seen_at!==fixedTime)||
  !f.columns.includes(f.key)))fail("FIXTURE_SOURCE_REVIEW_INVALID");
 for(const f of fixtures){
  for(const r of f.rows){
   if(Object.keys(r).sort().join("|")!==[...f.columns].sort().join("|")||
      String(r[f.key]).length<16||
      (r.projection_json&&!(r.projection_json.length>=400&&r.projection_json.length<=2400))||
      (r.story_json&&!(r.story_json.length>=100&&r.story_json.length<=4096)))
    fail("FIXTURE_COLUMNS_OR_BOUNDS_INVALID");
  }
 }
 return true;
}
export function fixtureSql(f){
 if(!STEP3_SHADOW_NONFACT_FIXTURES.includes(f)||!assertShadowNonfactPlan())
  fail("NOT_ALLOWLISTED_SHADOW_FIXTURE");
 const tuples=f.rows.map(r=>"("+f.columns.map(c=>
  r[c]===null?"NULL":quote(r[c])).join(",")+")").join(",");
 return "INSERT OR IGNORE INTO "+f.name+"("+f.columns.join(",")+
  ") VALUES "+tuples;
}
export function fixtureReadbackSql(f){
 if(!STEP3_SHADOW_NONFACT_FIXTURES.includes(f))fail("NOT_ALLOWLISTED_SHADOW_FIXTURE");
 return "SELECT "+f.columns.join(",")+" FROM "+f.name+
  " WHERE "+f.key+" IN ("+f.rows.map(r=>quote(r[f.key])).join(",")+
  ") ORDER BY "+f.key+" LIMIT 4";
}
export function fixtureReadbackMatches(f,rows){
 if(!Array.isArray(rows)||rows.length!==f.rows.length)return false;
 const expected=new Map(f.rows.map(r=>[r[f.key],r]));
 return rows.every(r=>expected.has(r[f.key])&&
  f.columns.every(c=>r[c]===expected.get(r[f.key])[c]));
}
function validateEnv(env,gitHead){
 if(env.GITHUB_ACTIONS!=="true"||
    env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    env.GITHUB_REF!=="refs/heads/main"||
    !SHA.test(env.GITHUB_SHA??"")||
    env.GITHUB_SHA!==gitHead||
    env.GEOMACRO_STEP3_EXACT_SHA!==env.GITHUB_SHA||
    env.GEOMACRO_STEP3_SHADOW_REHEARSAL_APPROVED!=="YES"||
    env.GEOMACRO_SHADOW_SCHEMA_BOOTSTRAP_APPROVED!=="YES"||
    env.GEOMACRO_D1_RECOVERY_R2_PRIVATE_APPROVED!=="YES"||
    !existsSync(HOLD)||
    !ACCOUNT.test(env.CLOUDFLARE_ACCOUNT_ID??"")||
    !UUID.test(env.D1_DATABASE_ID??"")||
    !UUID.test(env.GEOMACRO_D1_SHADOW_DATABASE_ID??"")||
    env.D1_DATABASE_ID.toLowerCase()===
      env.GEOMACRO_D1_SHADOW_DATABASE_ID.toLowerCase()||
    (env.CLOUDFLARE_API_TOKEN??"").length<20)
  fail("EXACT_MAIN_PROTECTED_SHADOW_APPROVAL_OR_HOLD_MISSING");
}
function dbQuery(config,sql,write=false){
 let raw;
 try{
  raw=execFileSync("npx",["-y","wrangler@4.136.3","d1","execute","DB",
   "--remote","--json","--command",sql,"--config",config],{
   encoding:"utf8",timeout:60000,maxBuffer:4_000_000,
   stdio:["ignore","pipe","pipe"]});
 }catch{fail(write?"NATIVE_SHADOW_WRITE_UNVERIFIED":"NATIVE_SHADOW_READ_UNVERIFIED")}
 let data;try{data=JSON.parse(raw)}catch{fail("NATIVE_PROVIDER_JSON_UNVERIFIED")}
 const x=data?.[0];
 if(!Array.isArray(data)||data.length!==1||x?.success!==true||
    !Number.isSafeInteger(x.meta?.rows_read)||
    !Number.isSafeInteger(x.meta?.rows_written)||
    x.meta.rows_read<0||x.meta.rows_written<0||
    (write&&x.meta.rows_written>100)||
    (!write&&
      (x.meta.rows_written!==0||!Array.isArray(x.results)||x.results.length>4)))
  fail("NATIVE_PROVIDER_BILLABLE_ROWS_OR_SUCCESS_UNVERIFIED");
 return {rows:x.results??[],rowsRead:x.meta.rows_read,
  rowsWritten:x.meta.rows_written};
}
function preflightSchema(config){
 const names=["materialized_cache","idx_private_osint_country_category_clock_v2",
  "idx_private_osint_check_category_status_v2","idx_website_derived_hot_order_v2"];
 const sql="SELECT type,name FROM sqlite_schema WHERE name IN ("+
  names.map(quote).join(",")+") ORDER BY name LIMIT 5";
 const rows=dbQuery(config,sql).rows;
 if(rows.length!==4||names.some(n=>!rows.some(r=>r.name===n&&
    r.type===(n==="materialized_cache"?"table":"index"))))
  fail("SHADOW_NATIVE_0204_SCHEMA_NOT_PRESENT");
 // Preserve the existing reviewed 3000-row per-table cap before any INSERT.
 for(const f of STEP3_SHADOW_NONFACT_FIXTURES){
  const overflow=dbQuery(config,
   "SELECT EXISTS(SELECT 1 FROM "+f.name+" LIMIT 1 OFFSET 2996) AS over_cap").rows;
  if(overflow.length!==1||overflow[0].over_cap!==0)
   fail("SHADOW_INDEX_TABLE_GROWTH_ABOVE_REVIEWED_CAP");
 }
}
export async function seedShadowNonfactIndexes({env=process.env,
 headroom=checkD1PaidMonthlyHeadroom,
 checkpoint=captureDurableD1Checkpoint,
 run=execFileSync}={}){
 const out={schema:"geomacro.step3.shadow-index-nonfact-fixture-receipt.v1",
  status:"NOT_YET_VERIFIED",fixture_status:"HOLD",
  code:"STEP3_SHADOW_FIXTURE_NOT_STARTED",
  stage1_physical_pass:false,stage2_authorized:false,
  real_news_originals_created:0,source_rights_created:0,
  synthetic_test_rows_created:0,
  no_real_news_or_signed_gro_claim:true,no_payment_authorization:true,
  production_d1_reads:0,production_d1_writes:0,canary_promoted:false,
  hold_file_untouched:true};
 try{
  assertShadowNonfactPlan();
  const head=run("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
  validateEnv(env,head);
  out.stage="PAID_MONTHLY_QUOTA";
  const quota=await headroom({env,lane:"shadow",
   estimatedMigrationRowsRead:10000,estimatedMigrationRowsWritten:100});
  if(quota?.status!=="PASS"||
     quota.provider_subscription_verified!==true||
     quota.reserve_pct!==30)fail("REAL_ACCOUNT_PAID_MONTHLY_HEADROOM_HOLD");
  const dir=mkdtempSync(join(tmpdir(),"geomacro-step3-nonfact-"));
  const config=join(dir,"wrangler.jsonc");
  writeFileSync(config,JSON.stringify({name:"geomacro-step3-nonfact-shadow-only",
   compatibility_date:"2026-11-09",d1_databases:[{
    binding:"DB",database_name:"geomacro-d1-publisher-shadow",
    database_id:env.GEOMACRO_D1_SHADOW_DATABASE_ID}]}),{mode:0o600});
  out.stage="SHADOW_SCHEMA_AND_SIZE";
  preflightSchema(config);
  for(const f of STEP3_SHADOW_NONFACT_FIXTURES){
   const before=dbQuery(config,fixtureReadbackSql(f)).rows;
   if(before.length!==0&&!fixtureReadbackMatches(f,before))
    fail("EXISTING_SHADOW_FIXTURE_COLLISION_OR_PARTIAL_ROWS");
  }
  out.stage="DURABLE_ENCRYPTED_SHADOW_RECOVERY";
  const fixtureManifestSha=sha(JSON.stringify(STEP3_SHADOW_NONFACT_FIXTURES));
  const c=await checkpoint({env,dbId:env.GEOMACRO_D1_SHADOW_DATABASE_ID,
   migrationSha:fixtureManifestSha});
  if(c?.status!=="PASS_REAL_PROVIDER_R2_BYTE_READBACK"||
     c.private_r2_encrypted_readback_verified!==true||
     c.signed_manifest_readback_verified!==true)
   fail("ENCRYPTED_RECOVERY_R2_BYTE_READBACK_HOLD");
  out.recovery_checkpoint_verified=true;
  out.encrypted_recovery_manifest_sha256=c.manifest_sha256;
  out.stage="IDEMPOTENT_SHADOW_ONLY_INSERT";
  for(const f of STEP3_SHADOW_NONFACT_FIXTURES){
   const inserted=dbQuery(config,fixtureSql(f),true);
   out.synthetic_test_rows_created+=inserted.rowsWritten;
   const actual=dbQuery(config,fixtureReadbackSql(f)).rows;
   if(!fixtureReadbackMatches(f,actual))
    fail("NONFACT_FIXTURE_D1_READBACK_MISMATCH");
  }
  out.fixture_table_count=STEP3_SHADOW_NONFACT_FIXTURES.length;
  out.fixture_expected_rows=9;
  out.fixture_readback_verified=true;
  out.fixture_status="PASS_SHADOW_ONLY_NONFACT_REPRESENTATIVE_KEY_ROWS";
  out.code="STEP3_SHADOW_FIXTURE_VERIFIED_NOT_REAL_EVENT_EVIDENCE";
 }catch(e){
  out.fixture_status="HOLD";
  out.code=/^STEP3_SHADOW_FIXTURE_[A-Z0-9_]{3,150}$/u.test(e?.message??"")?
   e.message:"STEP3_SHADOW_FIXTURE_PROVIDER_OR_RECOVERY_UNVERIFIED";
 }finally{
  out.completed_at_utc=new Date().toISOString();
  out.stage1_physical_pass=false;out.stage2_authorized=false;
  out.production_d1_reads=0;out.production_d1_writes=0;
  out.real_news_originals_created=0;out.source_rights_created=0;
  out.hold_file_untouched=existsSync(HOLD);
 }
 return out;
}
async function main(){
 const args=process.argv.slice(2);
 if(args.length!==1||!["--plan","--apply"].includes(args[0])){
  console.error("Usage: --plan | --apply");process.exitCode=2;return;
 }
 if(args[0]==="--plan"){
  console.log(JSON.stringify({status:"PLAN_ONLY_NO_PROVIDER_ACCESS",
   stage1_physical_pass:false,production_d1_queries:0,shadow_d1_writes:0,
   nonfact_fixture_rows:9,synthetic:true,
   manifest_sha256:sha(JSON.stringify(STEP3_SHADOW_NONFACT_FIXTURES))}));return;
 }
 const report=await seedShadowNonfactIndexes();
 mkdirSync(resolve(REPORT,".."),{recursive:true,mode:0o700});
 let signed;
 try{signed=signStep3StatusReceipt(report,process.env.SIGNING_JWK)}
 catch{signed={schema:"geomacro.step3.unsigned-nonfact-fixture.v1",
  receipt:report,attestation:null};report.fixture_status="HOLD";
  report.code="STEP3_SHADOW_FIXTURE_SIGNING_KEY_UNVERIFIED"}
 writeFileSync(REPORT,JSON.stringify(signed,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify({fixture_status:report.fixture_status,code:report.code,
  stage1_physical_pass:false,production_d1_writes:0,
  nonfact_fixture_rows:report.fixture_expected_rows??0,receipt:REPORT}));
 if(report.fixture_status!=="PASS_SHADOW_ONLY_NONFACT_REPRESENTATIVE_KEY_ROWS")
  process.exitCode=3;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 await main();
