#!/usr/bin/env node
/**
 * One-time, strictly isolated real Shadow D1 prerequisite schema bootstrap.
 * Never contains original news, a synthetic B2 ACK, a payment, or paid release.
 * On a failed migration, preserve the pre-DDL encrypted Time Travel bookmark
 * for an independently approved recovery; NEVER auto-restore over unknown rows.
 */
import {createHash} from "node:crypto";
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync,cpSync} from "node:fs";
import {join,resolve} from "node:path";
import {tmpdir} from "node:os";
import {execFileSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import {checkD1PaidMonthlyHeadroom} from "../lib/d1-workers-paid-monthly-governor.mjs";
import {captureDurableD1Checkpoint} from "../lib/d1-step3-recovery-checkpoint.mjs";

const ACCOUNT="fddd57d28199bad07a768445e7237693";
const SHADOW="c4add153-229d-412a-b1bd-489526b7e02f";
const PROD="db057ca9-9f6e-4957-ac28-144f3b798f9b";
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const SHA=/^[a-f0-9]{40}$/u;
const FAIL="STEP3_SHADOW_BOOTSTRAP_";
const REPORT="artifacts/release/step3-shadow-schema-bootstrap.json";
const fail=code=>{throw Error(FAIL+code)};
const hash=v=>createHash("sha256").update(v).digest("hex");
// Review order is immutable. Never enumerate folders or run wildcard migrations.
export const SHADOW_BASE_MIGRATIONS=Object.freeze([
 "0017_website_derived_news_only.sql",
 "0028_private_osint_15m_durable.sql",
 "0029_private_osint_bundle_index.sql",
 "0030_website_derived_first_seen_index.sql",
 "0035_phase2h_private_raw_news.sql",
 "0036_phase2h_72h_retention_index.sql",
 "0111_phase2h_risk_country_materialization.sql",
 "0113_p0a_source_registry.sql",
 "0114_p0_b_spool_queue.sql",
 "0116_p0b_microbatch_spool.sql",
 "0208_phase2h_atomic_archive_census.sql",
]);
const SCHEMA=Object.freeze([
 "website_derived_intelligence","private_osint_news_25h",
 "private_osint_source_checks_24h","phase2h_private_raw_news",
 "source_registry","ingestion_spool_queue","normalized_articles",
 "ingestion_spool_bundles","phase2h_archive_totals",
 "idx_phase2h_retention_first_ingested",
 "idx_phase2h_risk_country_category_clock",
 "idx_phase2h_pending_recent_ingested_category",
 "idx_spool_committed_day"
]);
export function buildShadowBootstrapManifest({read=readFileSync}={}){
 const migrations=SHADOW_BASE_MIGRATIONS.map((name,i)=>{
  const path="workers/control-plane/migrations/"+name;
  const sql=read(path,"utf8");
  if(typeof sql!=="string"||sql.length<120||sql.length>25000||
     !sql.startsWith("--")||
     /\b(?:DROP\s+TABLE|DELETE\s+FROM|REPLACE\s+INTO)\b/iu.test(sql)||
     (/\bUPDATE\s+\w+\s+SET\b/iu.test(sql)&&
      name!=="0208_phase2h_atomic_archive_census.sql")||
     (/\bALTER\s+TABLE\b/iu.test(sql)&&
      !["0111_phase2h_risk_country_materialization.sql",
        "0116_p0b_microbatch_spool.sql"].includes(name)))
   fail("MIGRATION_SOURCE_UNREVIEWED_OR_DESTRUCTIVE");
  return Object.freeze({name,sequence:i+1,sql_sha256:hash(sql),
   size_bytes:Buffer.byteLength(sql)});
 });
 const digest=hash(JSON.stringify(migrations));
 return Object.freeze({schema:"geomacro.step3.shadow-base-manifest.v1",
  status:"REVIEWED_SOURCE_PLAN_ONLY_NO_PROVIDER_IO",migrations,
  migration_set_sha256:digest,expected_schema_names:SCHEMA,
  production_d1_mutations:0,production_d1_queries:0,real_source_or_b2_ack_included:false,
  stage1_physical_pass:false,stage2_authorized:false,payments_authorized:false});
}
export function assertShadowBootstrapIdentity(env){
 if(env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    env.GITHUB_REF!=="refs/heads/main"||
    !SHA.test(env.GITHUB_SHA??"")||
    env.CLOUDFLARE_ACCOUNT_ID!==ACCOUNT||
    env.D1_DATABASE_ID!==PROD||
    env.GEOMACRO_D1_SHADOW_DATABASE_ID!==SHADOW||
    !UUID.test(env.D1_DATABASE_ID)||!UUID.test(env.GEOMACRO_D1_SHADOW_DATABASE_ID)||
    env.D1_DATABASE_ID===env.GEOMACRO_D1_SHADOW_DATABASE_ID||
    env.GEOMACRO_SHADOW_SCHEMA_BOOTSTRAP_APPROVED!=="YES"||
    env.GEOMACRO_D1_RECOVERY_R2_PRIVATE_APPROVED!=="YES"||
    typeof env.CLOUDFLARE_API_TOKEN!=="string"||
    env.CLOUDFLARE_API_TOKEN.length<20||
    !existsSync("config/d1-hotspot-v2-canary.hold"))
  fail("EXACT_MAIN_SHADOW_OWNER_RECOVERY_BINDING_OR_HOLD_UNVERIFIED");
 return true;
}
function parseSqlRows(doc,{max=40}={}){
 const rows=doc?.result;
 if(doc?.success!==true||!Array.isArray(rows)||rows.length!==1||
    rows[0]?.success!==true||!Array.isArray(rows[0]?.results)||
    rows[0].results.length>max||
    !Number.isSafeInteger(rows[0]?.meta?.rows_read)||
    rows[0].meta.rows_read>500||rows[0].meta.rows_read<0||
    rows[0].meta.rows_written!==0)
  fail("SHADOW_NATIVE_READBACK_META_INVALID");
 return rows[0].results;
}
export async function readOnlyShadowSchema({env,fetchImpl=fetch,sql}={}){
 if(!["SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name LIMIT 33",
    "SELECT type,name FROM sqlite_schema WHERE name IN ("+
    SCHEMA.map(x=>"'"+x+"'").join(",")+") ORDER BY name LIMIT 13"].includes(sql))
  fail("PROVIDER_SQL_OUTSIDE_FIXED_READONLY_SCOPE");
 let response;
 try{
  response=await fetchImpl("https://api.cloudflare.com/client/v4/accounts/"+
   ACCOUNT+"/d1/database/"+SHADOW+"/query",{
   method:"POST",redirect:"error",cache:"no-store",
   headers:{Authorization:"Bearer "+env.CLOUDFLARE_API_TOKEN,
    "Content-Type":"application/json"},
   body:JSON.stringify({sql,params:[]}),
   signal:AbortSignal.timeout(15000)
  });
 }catch{fail("SHADOW_READONLY_PROVIDER_NETWORK_UNAVAILABLE")}
 if(!response||response.status!==200||response.redirected)
  fail("SHADOW_READONLY_PROVIDER_HTTP_UNVERIFIED");
 let data;
 try{data=await response.json()}catch{fail("SHADOW_READONLY_RESPONSE_INVALID")}
 return parseSqlRows(data);
}
export function assertPristineShadowSchema(rows){
 if(!Array.isArray(rows)||rows.length!==0)
  fail("SHADOW_NOT_PRISTINE_OR_PARTIAL_BOOTSTRAP_REQUIRES_RECOVERY_REVIEW");
 return true;
}
const configFor=(base,db,dir)=>{
 const path=join(base,"wrangler-shadow-baseline.jsonc");
 writeFileSync(path,JSON.stringify({
  name:"geomacro-step3-shadow-schema-only",
  compatibility_date:"2026-11-09",
  d1_databases:[{binding:"DB",database_name:"geomacro-d1-publisher-shadow",
   database_id:db,migrations_dir:dir}]
 }),{mode:0o600});
 return path;
};
function wranglerApply(config){
 try{
  execFileSync("npx",["-y","wrangler@4.136.3","d1","migrations","apply",
   "DB","--remote","--config",config],{
   encoding:"utf8",timeout:240000,maxBuffer:400000,
   stdio:["ignore","pipe","pipe"],
   env:{...process.env,CI:"true"}
  });
 }catch{fail("SHADOW_REVIEWED_SQL_NATIVE_APPLICATION_UNVERIFIED")}
}
export async function bootstrapShadowBaseline({
 env=process.env,fetchImpl=fetch,headroomCheck=checkD1PaidMonthlyHeadroom,
 checkpointCapture=captureDurableD1Checkpoint,apply=wranglerApply
}={}){
 const started=new Date().toISOString(),manifest=buildShadowBootstrapManifest();
 const report={schema:"geomacro.step3.shadow-base-bootstrap.v1",
  status:"HOLD",code:"STEP3_SHADOW_BOOTSTRAP_NOT_STARTED",started,
  scope:"REAL_SHADOW_ONLY",production_d1_reads:0,production_d1_writes:0,
  shadow_sql_mutated:false,real_b2_source_attested:false,
  stage1_physical_pass:false,stage2_authorized:false,
  merchant_funds_authorized:false,migration_set_sha256:manifest.migration_set_sha256,
  encrypted_checkpoint_verified:false,shadow_schema_readback_verified:false};
 try{
  assertShadowBootstrapIdentity(env);
  // No D1 SQL may be written on an absent/rejected real Paid billing receipt.
  const quota=await headroomCheck({env,fetchImpl,lane:"shadow",
   estimatedMigrationRowsRead:5000,estimatedMigrationRowsWritten:5000});
  if(quota?.status!=="PASS"||quota.reserve_pct!==30||
     quota.provider_subscription_verified!==true)
   fail("PAID_30PCT_PROVIDER_HEADROOM_NOT_VERIFIED");
  report.paid_headroom_verified_for_shadow=true;
  const before=await readOnlyShadowSchema({env,fetchImpl,
   sql:"SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name LIMIT 33"});
  assertPristineShadowSchema(before);
  // No database mutation before real Time Travel and signed encrypted R2 PUT/GET.
  const checkpoint=await checkpointCapture({env,fetchImpl,dbId:SHADOW,
   migrationSha:manifest.migration_set_sha256});
  if(checkpoint?.status!=="PASS_REAL_PROVIDER_R2_BYTE_READBACK"||
     checkpoint.private_r2_encrypted_readback_verified!==true||
     checkpoint.signed_manifest_readback_verified!==true)
   fail("ENCRYPTED_R2_RECOVERY_READBACK_NOT_VERIFIED");
  report.encrypted_checkpoint_verified=true;
  report.recovery_manifest_sha256=checkpoint.manifest_sha256;
  report.recovery_bookmark_sha256=checkpoint.bookmark_sha256;
  const base=mkdtempSync(join(tmpdir(),"geomacro-step3-shadow-schema-"));
  const dir=join(base,"migrations");
  mkdirSync(dir,{recursive:true,mode:0o700});
  for(const m of manifest.migrations){
   const source="workers/control-plane/migrations/"+m.name;
   const sql=readFileSync(source,"utf8");
   if(hash(sql)!==m.sql_sha256)fail("MIGRATION_SOURCE_SHA_DRIFT");
   const filename=String(m.sequence).padStart(4,"0")+"_"+m.name;
   writeFileSync(join(dir,filename),sql,{mode:0o600});
  }
  const config=configFor(base,SHADOW,dir);
  report.shadow_sql_mutated=true; // conservative on attempted native DDL
  await apply(config);
  const rows=await readOnlyShadowSchema({env,fetchImpl,
   sql:"SELECT type,name FROM sqlite_schema WHERE name IN ("+
     SCHEMA.map(x=>"'"+x+"'").join(",")+") ORDER BY name LIMIT 13"});
  const observed=new Map(rows.map(x=>[x.name,x.type]));
  if(rows.length!==SCHEMA.length||
     SCHEMA.some(x=>!observed.has(x)||!["table","index"].includes(observed.get(x))))
   fail("SHADOW_BASE_SCHEMA_POST_APPLY_PROVIDER_READBACK_INVALID");
  report.shadow_schema_readback_verified=true;
  report.status="SHADOW_PREREQUISITE_SCHEMA_VERIFIED_NOT_STAGE1_PASS";
  report.code="SHADOW_BASE_SCHEMA_ONLY_REQUIRES_B2_ACK_POINTER_AND_DUAL_WORKER_PROOF";
 }catch(e){
  report.status="HOLD";
  report.code=/^STEP3_SHADOW_BOOTSTRAP_[A-Z0-9_]+$/u.test(e?.message??"")?
    e.message:"STEP3_SHADOW_BOOTSTRAP_PROVIDER_OR_SOURCE_UNVERIFIED";
 }finally{
  report.completed_at=new Date().toISOString();
  report.production_d1_reads=0;report.production_d1_writes=0;
  report.stage1_physical_pass=false;report.stage2_authorized=false;
  report.merchant_funds_authorized=false;
 }
 return Object.freeze(report);
}

/** Strictly no-DDL main-only preflight; never infer source/B2 evidence. */
export async function readOnlyShadowBootstrapPreflight({
 env=process.env,fetchImpl=fetch,headroomCheck=checkD1PaidMonthlyHeadroom
}={}){
 const output={schema:"geomacro.step3.shadow-bootstrap-readonly-preflight.v1",
  status:"HOLD",code:"SHADOW_BOOTSTRAP_PREFLIGHT_NOT_STARTED",
  scope:"PROTECTED_MAIN_REAL_SHADOW_READONLY",
  production_d1_queries:0,production_d1_writes:0,shadow_d1_writes:0,
  r2_puts:0,b2_requests:0,worker_deployments:0,payments:0,
  shadow_schema_pristine:false,paid_headroom_verified:false,
  owner_bootstrap_approved:env.GEOMACRO_SHADOW_SCHEMA_BOOTSTRAP_APPROVED==="YES",
  r2_private_recovery_approved:env.GEOMACRO_D1_RECOVERY_R2_PRIVATE_APPROVED==="YES",
  r2_encrypted_recovery_readback_verified:false,
  stage1_physical_pass:false,stage2_authorized:false};
 try{
  // Read-only preflight does not impersonate or grant the mutation approval.
  // Still enforce canonical account and exact Shadow-vs-Prod identities.
  if(env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
     env.GITHUB_REF!=="refs/heads/main"||
     !SHA.test(env.GITHUB_SHA??"")||
     env.CLOUDFLARE_ACCOUNT_ID!==ACCOUNT||
     env.D1_DATABASE_ID!==PROD||
     env.GEOMACRO_D1_SHADOW_DATABASE_ID!==SHADOW||
     !existsSync("config/d1-hotspot-v2-canary.hold")||
     typeof env.CLOUDFLARE_API_TOKEN!=="string"||
     env.CLOUDFLARE_API_TOKEN.length<20)
   fail("READONLY_EXACT_MAIN_ACCOUNT_OR_SHADOW_IDENTITY_UNVERIFIED");
  const headroom=await headroomCheck({env,fetchImpl,lane:"shadow",
   estimatedMigrationRowsRead:5000,estimatedMigrationRowsWritten:5000});
  output.paid_headroom_verified=headroom?.status==="PASS"&&
   headroom.reserve_pct===30&&headroom.provider_subscription_verified===true;
  output.headroom_status=headroom?.status??"HOLD";
  output.headroom_reason=headroom?.reason??"PROVIDER_UNVERIFIED";
  const rows=await readOnlyShadowSchema({env,fetchImpl,
   sql:"SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name LIMIT 33"});
  output.shadow_existing_table_count=rows.length;
  output.shadow_schema_pristine=rows.length===0;
  output.status=output.paid_headroom_verified&&output.shadow_schema_pristine?
   "READONLY_PREREQUISITES_VERIFIED_NOT_DDL_AUTHORIZATION":"HOLD";
  output.code=output.status==="HOLD"?
   (!output.paid_headroom_verified?"PAID_HEADROOM_INSUFFICIENT_OR_UNVERIFIED":
    "SHADOW_SCHEMA_NONEMPTY_REQUIRES_INDEPENDENT_REVIEW"):
   "SHADOW_PRISTINE_AND_PAID_HEADROOM_OBSERVED";
 }catch(e){
  output.code=/^STEP3_SHADOW_BOOTSTRAP_[A-Z0-9_]+$/u.test(e?.message??"")?
   e.message:"SHADOW_READONLY_PROVIDER_UNVERIFIED";
 }
 return Object.freeze(output);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2);
 if(args.length!==1||!["--plan","--preflight","--apply"].includes(args[0])){
  console.error("Usage: node scripts/ops/bootstrap-step3-shadow-baseline.mjs --plan|--preflight|--apply");
  process.exitCode=2;
 }else if(args[0]==="--plan")console.log(JSON.stringify(buildShadowBootstrapManifest()));
 else if(args[0]==="--preflight"){
  const report=await readOnlyShadowBootstrapPreflight();
  mkdirSync(resolve(REPORT,".."),{recursive:true,mode:0o700});
  writeFileSync(REPORT,JSON.stringify(report,null,2)+"\n",{mode:0o600});
  console.log(JSON.stringify(report));
  if(report.status!=="READONLY_PREREQUISITES_VERIFIED_NOT_DDL_AUTHORIZATION")process.exitCode=3;
 }else {
  const report=await bootstrapShadowBaseline();
  mkdirSync(resolve(REPORT,".."),{recursive:true,mode:0o700});
  writeFileSync(REPORT,JSON.stringify(report,null,2)+"\n",{mode:0o600});
  console.log(JSON.stringify(report));
  if(report.status!=="SHADOW_PREREQUISITE_SCHEMA_VERIFIED_NOT_STAGE1_PASS")
   process.exitCode=3;
 }
}
