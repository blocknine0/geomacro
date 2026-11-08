import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {
 SHADOW_BASE_MIGRATIONS,buildShadowBootstrapManifest,
 assertShadowBootstrapIdentity,assertPristineShadowSchema,
 bootstrapShadowBaseline,readOnlyShadowBootstrapPreflight
} from "../ops/bootstrap-step3-shadow-baseline.mjs";

const account="fddd57d28199bad07a768445e7237693";
const shadow="c4add153-229d-412a-b1bd-489526b7e02f";
const production="db057ca9-9f6e-4957-ac28-144f3b798f9b";
const env=()=>({
 GITHUB_REPOSITORY:"blocknine0/geomacro",GITHUB_REF:"refs/heads/main",
 GITHUB_SHA:"f".repeat(40),CLOUDFLARE_ACCOUNT_ID:account,
 D1_DATABASE_ID:production,GEOMACRO_D1_SHADOW_DATABASE_ID:shadow,
 GEOMACRO_SHADOW_SCHEMA_BOOTSTRAP_APPROVED:"YES",
 GEOMACRO_D1_RECOVERY_R2_PRIVATE_APPROVED:"YES",
 CLOUDFLARE_API_TOKEN:"x".repeat(48)
});
const usage=()=>({status:"PASS",reserve_pct:30,provider_subscription_verified:true});
const asResult=rows=>Response.json({success:true,result:[{success:true,
 results:rows,meta:{rows_read:Math.max(1,rows.length),rows_written:0}}]});
test("baseline is nine exact reviewed migrations with no mutable wildcard SQL",()=>{
 const m=buildShadowBootstrapManifest();
 assert.equal(SHADOW_BASE_MIGRATIONS.length,9);
 assert.equal(new Set(SHADOW_BASE_MIGRATIONS).size,9);
 assert.deepEqual(m.migrations.map(x=>x.name),SHADOW_BASE_MIGRATIONS);
 assert.match(m.migration_set_sha256,/^[a-f0-9]{64}$/u);
 assert.equal(m.stage1_physical_pass,false);
 assert.equal(m.real_source_or_b2_ack_included,false);
 assert.equal(m.production_d1_mutations,0);
 assert.throws(()=>buildShadowBootstrapManifest({
  read:()=> "-- BAD\nDROP TABLE production_data;".padEnd(130," ")
 }),/MIGRATION_SOURCE_UNREVIEWED_OR_DESTRUCTIVE/);
});
test("empty local SQLite Shadow bootstrap supports exact staged 0204 0211 0212 0213 without source rows",()=>{
 const db=new DatabaseSync(":memory:");
 try{
  for(const file of SHADOW_BASE_MIGRATIONS)
   db.exec(readFileSync("workers/control-plane/migrations/"+file,"utf8"));
  for(const path of [
   "workers/control-plane/migrations/0204_d1_read_hotspot_optimization.sql",
   "workers/control-plane/migrations/0211_p0b_daily_committed_count.sql",
   "workers/control-plane/staged-migrations/0212_d1_keyset_hourly_pending_census.sql",
   "workers/control-plane/staged-migrations/0213_phase2h_raw_ref_only_v1.sql"
  ])db.exec(readFileSync(path,"utf8"));
  const names=new Set(db.prepare("SELECT name FROM sqlite_schema").all().map(x=>x.name));
  for(const needed of [
   "phase2h_private_raw_news","phase2h_raw_object_refs_v1",
   "private_osint_news_25h","website_derived_intelligence",
   "p0b_committed_day_totals","phase2h_pending_hourly_v1",
   "idx_phase2h_retention_first_ingested","idx_phase2h_ref_ingest_clock_v1",
   "trg_p0b_day_committed_insert","trg_phase2h_hourly_pending_insert_v1"
  ])assert(names.has(needed),needed);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM phase2h_private_raw_news").get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM phase2h_raw_object_refs_v1").get().n,0);
 }finally{db.close()}
});
test("wrong SHA scope, prod UUID collision and missing owner approval fail before provider IO",async()=>{
 for(const patch of [
  {GITHUB_REF:"refs/heads/feature"},
  {CLOUDFLARE_ACCOUNT_ID:"a".repeat(32)},
  {D1_DATABASE_ID:shadow},
  {GEOMACRO_D1_SHADOW_DATABASE_ID:production},
  {GEOMACRO_SHADOW_SCHEMA_BOOTSTRAP_APPROVED:"NO"},
  {GEOMACRO_D1_RECOVERY_R2_PRIVATE_APPROVED:""},
  {CLOUDFLARE_API_TOKEN:""}
 ]){
  let called=false;
  const report=await bootstrapShadowBaseline({env:{...env(),...patch},
   headroomCheck:async()=>{called=true;throw Error("unexpected")},
   checkpointCapture:async()=>{called=true;throw Error("unexpected")},
   fetchImpl:async()=>{called=true;throw Error("unexpected")},
   apply:async()=>{called=true;throw Error("unexpected")}
  });
  assert.equal(report.status,"HOLD");
  assert.equal(report.production_d1_writes,0);
  assert.equal(report.shadow_sql_mutated,false);
  assert.equal(called,false,JSON.stringify(patch));
 }
 assert.equal(assertShadowBootstrapIdentity(env()),true);
 assert.throws(()=>assertPristineShadowSchema([{name:"unknown"}]),
  /SHADOW_NOT_PRISTINE/);
});
test("unverified billing or unknown existing Shadow tables forbid all DDL",async()=>{
 let c=0;
 const first=await bootstrapShadowBaseline({env:env(),
  headroomCheck:async()=>({status:"HOLD",reserve_pct:30}),
  fetchImpl:async()=>{c++;return asResult([])},
  checkpointCapture:async()=>{c++;throw Error("unexpected")},
  apply:async()=>{c++;throw Error("unexpected")}
 });
 assert.equal(first.status,"HOLD");
 assert.match(first.code,/PAID_30PCT_PROVIDER_HEADROOM_NOT_VERIFIED/u);
 assert.equal(c,0);
 const second=await bootstrapShadowBaseline({env:env(),
  headroomCheck:async()=>usage(),
  fetchImpl:async()=>asResult([{name:"production_restricted"}]),
  checkpointCapture:async()=>{c++;throw Error("unexpected")},
  apply:async()=>{c++;throw Error("unexpected")}
 });
 assert.equal(second.status,"HOLD");
 assert.match(second.code,/SHADOW_NOT_PRISTINE_OR_PARTIAL_BOOTSTRAP/u);
 assert.equal(c,0);
});
test("signed encrypted R2 provider backup must physically read back before any schema writes",async()=>{
 let writes=0;
 const report=await bootstrapShadowBaseline({env:env(),
  headroomCheck:async()=>usage(),
  fetchImpl:async()=>asResult([]),
  checkpointCapture:async()=>({status:"NOT_YET_VERIFIED",
   private_r2_encrypted_readback_verified:false}),
  apply:async()=>{writes++}
 });
 assert.equal(report.status,"HOLD");
 assert.match(report.code,/ENCRYPTED_R2_RECOVERY_READBACK_NOT_VERIFIED/u);
 assert.equal(writes,0);
 assert.equal(report.shadow_sql_mutated,false);
});
test("mock provider ordered execution never invents signed Stage1 or B2 original proof",async()=>{
 let reads=0,applies=0;
 const out=await bootstrapShadowBaseline({env:env(),
  headroomCheck:async()=>usage(),
  checkpointCapture:async()=>({
   status:"PASS_REAL_PROVIDER_R2_BYTE_READBACK",
   private_r2_encrypted_readback_verified:true,signed_manifest_readback_verified:true,
   manifest_sha256:"a".repeat(64),bookmark_sha256:"b".repeat(64)
  }),
  fetchImpl:async(_url,init)=>{
   assert.equal(init.method,"POST");
   const sql=JSON.parse(init.body).sql;
   reads++;
   if(reads===1){assert.match(sql,/sqlite_schema/u);return asResult([])}
   assert.match(sql,/sqlite_schema/u);
   return asResult(buildShadowBootstrapManifest().expected_schema_names.map(name=>({
    name,type:name.startsWith("idx_")?"index":"table"
   })));
  },
  apply:async()=>{applies++}
 });
 assert.equal(applies,1);
 assert.equal(out.status,"SHADOW_PREREQUISITE_SCHEMA_VERIFIED_NOT_STAGE1_PASS");
 assert.equal(out.encrypted_checkpoint_verified,true);
 assert.equal(out.shadow_schema_readback_verified,true);
 assert.equal(out.stage1_physical_pass,false);
 assert.equal(out.real_b2_source_attested,false);
 assert.equal(out.production_d1_writes,0);
 assert.equal(out.merchant_funds_authorized,false);
});

test("real Shadow-only read-only preflight is usable before owner DDL approval",async()=>{
 let reads=0;
 const holdEnv={...env(),GEOMACRO_SHADOW_SCHEMA_BOOTSTRAP_APPROVED:"",
  GEOMACRO_D1_RECOVERY_R2_PRIVATE_APPROVED:""};
 const report=await readOnlyShadowBootstrapPreflight({
  env:holdEnv,headroomCheck:async()=>usage(),
  fetchImpl:async(_url,init)=>{
   assert.equal(init.method,"POST");
   const sql=JSON.parse(init.body).sql;
   assert.match(sql,/sqlite_schema/u);
   reads++;return asResult([]);
  }
 });
 assert.equal(reads,1);
 assert.equal(report.status,"READONLY_PREREQUISITES_VERIFIED_NOT_DDL_AUTHORIZATION");
 assert.equal(report.owner_bootstrap_approved,false);
 assert.equal(report.r2_private_recovery_approved,false);
 assert.equal(report.stage1_physical_pass,false);
 assert.equal(report.production_d1_writes,0);
 assert.equal(report.shadow_d1_writes,0);
 assert.equal(report.r2_puts,0);
});
test("real Shadow-only preflight NEVER upgrades nonempty schema or absent Paid permission",async()=>{
 const cases=[
  {headroom:{status:"HOLD",reserve_pct:30,provider_subscription_verified:false},rows:[]},
  {headroom:usage(),rows:[{name:"unknown_existing_business_table"}]},
 ];
 for(const c of cases){
  const report=await readOnlyShadowBootstrapPreflight({
   env:env(),headroomCheck:async()=>c.headroom,
   fetchImpl:async()=>asResult(c.rows)
  });
  assert.equal(report.status,"HOLD");
  assert.equal(report.stage2_authorized,false);
  assert.equal(report.production_d1_writes,0);
  assert.equal(report.shadow_d1_writes,0);
 }
});
