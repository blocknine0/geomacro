import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {STEP3_MIGRATIONS,step3SqlManifests,step3SizeProbeSQL,
 validateStep3SizeProbe,step3NativeHistorySQL,
 classifyStep3NativeHistory,step30212PendingSourcePreflightSQL,
 validateStep30212PendingSourcePreflight,
 step3SchemaSQL,verifyStep3Schema,
 verifyStep3Integrity,verifyStep3Explain,compareImmutableBaseline}
 from "../lib/d1-step3-migration-contract.mjs";
import {parseStep3WranglerQuery}
 from "../ops/run-step3-protected-d1-migrations.mjs";

test("only four reviewed migration SQL files exist in immutable order",()=>{
 assert.deepEqual(STEP3_MIGRATIONS.map(x=>x.id),
  ["0204","0211","0212","0213"]);
 const manifest=step3SqlManifests();
 assert.equal(manifest.length,4);
 for(const m of manifest){
  assert.match(m.sql_sha256,/^[a-f0-9]{64}$/u);
  assert(m.filename.startsWith(m.id+"_"));
  const sql=readFileSync(m.file,"utf8");
  assert(sql.length>250);
 }
 assert(manifest[2].file.includes("staged-migrations/"));
 assert(manifest[3].file.includes("staged-migrations/"));
});
test("bounded pre-seed and CREATE INDEX probe forbids >3k existing rows",()=>{
 const tables=STEP3_MIGRATIONS[0].sizeTables;
 const query=step3SizeProbeSQL(tables);
 assert.match(query,/OFFSET 3000/u);
 assert.match(query,/private_osint_news_25h/u);
 assert.match(query,/website_derived_intelligence/u);
 assert.equal(validateStep3SizeProbe(tables,
  [{over_0:0,over_1:0,over_2:0}]).status,"PASS");
 assert.throws(()=>validateStep3SizeProbe(tables,
  [{over_0:0,over_1:1,over_2:0}]),
  /SOURCE_ROWS_EXCEED_STAGED_INDEX_BUDGET/u);
 assert.throws(()=>step3SizeProbeSQL(["sqlite_master;DELETE FROM x"]),
  /TABLE_SIZE_SCOPE_INVALID/u);
});
test("Stage2 recovers only an authenticated existing Worker bearer before D1 provider writes",()=>{
 const y=readFileSync(".github/workflows/production-rollout-orchestrator.yml","utf8");
 const stage=y.indexOf("  stage2-production:");
 const auth=y.indexOf("Authenticate existing live Control Plane bearer without rotation",stage);
 const root=y.indexOf("secrets.GEOMACRO_COMMERCE_LEDGER_TOKEN",auth);
 const status=y.indexOf("node scripts/ops/prepare-five-gate-control-token.mjs",root);
 const receipt=y.indexOf("Check signed receipt before any D1 provider call",status);
 const apply=y.indexOf("node scripts/ops/run-step3-protected-d1-migrations.mjs --apply",receipt);
 assert(stage>0&&auth>stage&&root>auth&&status>root&&receipt>status&&apply>receipt);
 assert.match(y.slice(auth,receipt),/if: github.event_name == 'workflow_dispatch' && inputs.execute_stage2 == true/u);
 assert.doesNotMatch(y.slice(auth,receipt),/wrangler.*secret put|gh secret set|continue-on-error/u);
 assert(y.slice(stage,auth).includes("PHASE2H_R2_REFERENCE_HMAC_KEY: ${{ secrets.PHASE2H_R2_REFERENCE_HMAC_KEY }}"));
 const helper=readFileSync("scripts/ops/prepare-five-gate-control-token.mjs","utf8");
 assert.match(helper,/deriveControlPlaneRootToken\(root\)/u);
 assert.match(helper,/response\?\.status!==200/u);
 assert.match(helper,/mask\(token\)/u);
 assert.match(helper,/appendEnv\(env.GITHUB_ENV/u);
});

test("manual existing production bearer verifier is provider read-only and main-only",()=>{
 const y=readFileSync(".github/workflows/step3-existing-production-bearer-readonly.yml","utf8");
 assert.match(y,/workflow_dispatch:/u);
 assert.doesNotMatch(y,/schedule:|pull_request:/u);
 assert.match(y,/github\.ref == 'refs\/heads\/main'/u);
 assert.match(y,/environment: production/u);
 assert.match(y,/secrets\.GEOMACRO_COMMERCE_LEDGER_TOKEN/u);
 assert.match(y,/node scripts\/ops\/prepare-five-gate-control-token\.mjs/u);
 assert.match(y,/test -f config\/d1-hotspot-v2-canary\.hold/u);
 assert.doesNotMatch(y,/--apply|wrangler.*secret put|gh secret set|continue-on-error|d1 migrations apply|canary-promoter|release:remediate/u);
});

test("native D1 history distinguishes applied 0204/0211 from pending 0212/0213",()=>{
 const manifests=step3SqlManifests();
 const rows=[
  {id:89,name:manifests[0].filename,applied_at:"2026-11-06 07:24:08"},
  {id:96,name:manifests[1].filename,applied_at:"2026-11-07 16:41:52"}
 ];
 assert.match(step3NativeHistorySQL(),/FROM d1_migrations WHERE/);
 const history=classifyStep3NativeHistory(manifests,rows);
 assert.deepEqual(history.native_applied_ids,["0204","0211"]);
 assert.deepEqual(history.pending_ids,["0212","0213"]);
 assert.equal(history.sql_checksum_verified,false);
 assert.equal(history.production_release_authorized,false);
 assert.throws(()=>classifyStep3NativeHistory(manifests,[rows[0],rows[0]]),
  /NATIVE_HISTORY_AMBIGUOUS_OR_CHANGED/);
 assert.throws(()=>classifyStep3NativeHistory(manifests,
  [{...rows[0],name:"0204_changed.sql"}]),
  /NATIVE_HISTORY_AMBIGUOUS_OR_CHANGED/);
 assert.throws(()=>classifyStep3NativeHistory(manifests,
  [{id:100,name:manifests[2].filename,applied_at:"2026-11-10 09:00:00"}]),
  /NATIVE_HISTORY_GAPPED/);
 assert.throws(()=>classifyStep3NativeHistory(manifests,
  [{...rows[0],applied_at:"unverified"}]),
  /NATIVE_HISTORY_AMBIGUOUS_OR_CHANGED/);
 assert.deepEqual(classifyStep3NativeHistory(manifests,[]).native_applied_ids,[]);
 assert.deepEqual(classifyStep3NativeHistory(manifests,
  manifests.map((m,i)=>({id:100+i,name:m.filename,
   applied_at:"2026-11-10 09:00:00"}))).pending_ids,[]);
});
test("only pending DDL is size-probed; native schema is not acceptance",()=>{
 const src=readFileSync("scripts/ops/run-step3-protected-d1-migrations.mjs","utf8");
 const a=src.indexOf("const nativeHistory=q(config,step3NativeHistorySQL()");
 const b=src.indexOf("verifyStep3Schema(manifest.objects,observed.rows);",a);
 const c=src.indexOf("boundedInputs(config,manifest,state);",b);
 const d=src.indexOf("const checkpoint=await captureDurableD1Checkpoint",c);
 assert(a>0&&b>a&&c>b&&d>c);
 assert(src.includes('status:"SCHEMA_PRESENT_NOT_FULL_INTEGRITY_VERIFIED"'));
 assert(src.includes('if(state.status!=="PASS")fail("FINAL_PROTECTED_READBACK_HELD")'));
});

test("0212 pending reviewed large-source envelope covers 11822 rows, no 3k bypass elsewhere",()=>{
 const sql=step30212PendingSourcePreflightSQL();
 assert.match(sql,/phase2h_private_raw_news/u);
 assert.match(sql,/LIMIT 24001/u);
 assert.match(sql,/LIMIT 3001/u);
 assert.doesNotMatch(sql,/\b(?:INSERT|DELETE|UPDATE|ALTER|DROP|REPLACE)\b/iu);
 const a=validateStep30212PendingSourcePreflight([
  {raw_rows:11822,pending_rows:8000,hour_bins:216,
   osint_rows:2800,website_rows:2200}
 ]);
 assert.equal(a.status,"PASS_READ_ONLY_BOUNDED_0212_COST_ENVELOPE_NOT_PRODUCTION_APPROVAL");
 assert.equal(a.source_rows_verified,11822);
 assert(a.estimated_rows_read>11822);
 assert(a.estimated_rows_written<500000);
 assert.equal(a.production_release_authorized,false);
 assert.equal(a.no_sql_writes_performed,true);
 for(const x of [
  {raw_rows:24001,pending_rows:8000,hour_bins:216,osint_rows:1,website_rows:1},
  {raw_rows:11822,pending_rows:11823,hour_bins:216,osint_rows:1,website_rows:1},
  {raw_rows:11822,pending_rows:8000,hour_bins:3001,osint_rows:1,website_rows:1},
  {raw_rows:11822,pending_rows:8000,hour_bins:216,osint_rows:3001,website_rows:1},
  {raw_rows:11822,pending_rows:8000,hour_bins:216,osint_rows:1,website_rows:3001},
  {raw_rows:11822,pending_rows:0,hour_bins:216,osint_rows:1,website_rows:1},
  {raw_rows:22000,pending_rows:21000,hour_bins:216,osint_rows:3000,website_rows:3000}
 ])assert.throws(()=>validateStep30212PendingSourcePreflight([x]),
   /0212_REVIEWED_LARGE_SOURCE_BUDGET_EXCEEDED|0212_PENDING_HOUR_BIN_CONTRADICTION|0212_REVIEWED_MONTHLY_MIGRATION_ESTIMATE_EXCEEDED/);
});
test("Nov 10 live bounded provider source metrics fit reviewed 0212 estimate",()=>{
 // Read-only owner-run production D1 receipts: total=11822 on earlier
 // read; pending=7026, hourly bins=168, OSINT=2787 and website=44.
 // Observation is not a signed production-readback or future hard cap.
 const result=validateStep30212PendingSourcePreflight([{
  raw_rows:11822,pending_rows:7026,hour_bins:168,
  osint_rows:2787,website_rows:44
 }]);
 assert.equal(result.source_rows_verified,11822);
 assert.equal(result.original_pending_rows_observed,7026);
 assert.equal(result.canonical_hour_buckets_observed,168);
 assert.equal(result.estimated_rows_read,508275);
 assert.equal(result.estimated_rows_written,336620);
 assert.equal(result.production_release_authorized,false);
 assert.equal(result.no_sql_writes_performed,true);
});
test("production estimated cost is presented to live Paid admission before any DDL",()=>{
 const r=readFileSync("scripts/ops/run-step3-protected-d1-migrations.mjs","utf8");
 assert.match(r,/estimatedMigrationRowsRead:estimate\?\.estimated_rows_read\?\?0/u);
 assert.match(r,/estimatedMigrationRowsWritten:estimate\?\.estimated_rows_written\?\?0/u);
 const pre=r.indexOf("validateStep30212PendingSourcePreflight(source.rows)");
 const checkpoint=r.indexOf("const checkpoint=await captureDurableD1Checkpoint",pre);
 const ledger=r.indexOf("const ledger=ensureLedger(config,manifests,state)",pre);
 assert(pre>0&&checkpoint>pre&&ledger>checkpoint);
 assert.match(r,/if\(source.readRows>200000\)/u);
});

test("exact D1 native meta readback refuses missing rows and nonzero writes",()=>{
 const positive=JSON.stringify([{success:true,results:[{name:"materialized_cache"}],
  meta:{rows_read:2,rows_written:0}}]);
 assert.equal(parseStep3WranglerQuery(positive).rows[0].name,
  "materialized_cache");
 for(const invalid of [
  JSON.stringify([{success:true,results:[],meta:{rows_read:1}}]),
  JSON.stringify([{success:true,results:[],meta:{rows_read:1,rows_written:1}}]),
  JSON.stringify([{success:false,results:[],meta:{rows_read:1,rows_written:0}}]),
  "not-json",
 ]){
  assert.throws(()=>parseStep3WranglerQuery(invalid),
   /STEP3_D1_/u);
 }
});
test("postmigration schema must contain expected indexes, table and triggers",()=>{
 for(const step of STEP3_MIGRATIONS){
  const query=step3SchemaSQL(step.objects);
  assert.match(query,/sqlite_schema WHERE name IN/u);
  const ok=Object.entries(step.objects).map(([name,type])=>({
   name,type,sql:"CREATE "+type.toUpperCase()+" "+name+" ON geomacro (id)"}));
  assert.equal(verifyStep3Schema(step.objects,ok).schema_objects_verified,
   Object.keys(step.objects).length);
  assert.throws(()=>verifyStep3Schema(step.objects,ok.slice(1)),
   /SCHEMA_OBJECT_COUNT_MISMATCH/u);
 }
});
test("SQLite index integrity and index-backed EXPLAIN are mandatory",()=>{
 assert.equal(verifyStep3Integrity([{integrity_check:"ok"}],
  "phase2h_raw_object_refs_v1").index_tree_integrity,"PASS");
 assert.throws(()=>verifyStep3Integrity([{integrity_check:"bad index"}],
  "phase2h_raw_object_refs_v1"),/INDEX_TREE_INTEGRITY_NOT_OK/u);
 assert.equal(verifyStep3Explain([{detail:"SEARCH USING COVERING INDEX idx_private_osint_country_clock_v3"}],
  "idx_private_osint_country_clock_v3").index_search_plan,"PASS");
 assert.throws(()=>verifyStep3Explain([{detail:"SCAN TABLE full"}],
  "idx_private_osint_country_clock_v3"),/INDEX_SEARCH_PLAN_NOT_VERIFIED/u);
});
test("sampled immutable source SHA cannot silently change during schema migration",()=>{
 const hash="f".repeat(64);
 assert.equal(compareImmutableBaseline(hash,hash).unchanged,true);
 assert.throws(()=>compareImmutableBaseline(hash,"0".repeat(64)),
  /LEGACY_IMMUTABLE_SAMPLE_CHANGED/u);
});
test("real bearer required; absent HMAC permits only fresh or exactly empty 0213",()=>{
 const r=readFileSync("scripts/ops/run-step3-protected-d1-migrations.mjs","utf8");
 const approval=r.indexOf("function approved(env)");
 const auth=r.indexOf("PRODUCTION_CONTROL_BEARER_MISSING",approval);
 const off=r.indexOf("await verifyProductionRefOnlyOff({env})",auth);
 const schema=r.indexOf("UNSIGNED_0213_EXISTING_REFERENCE_SCHEMA_UNVERIFIED",off);
 const backup=r.indexOf("const checkpoint=await captureDurableD1Checkpoint",schema);
 const ledger=r.indexOf("const ledger=ensureLedger(config,manifests,state)",backup);
 assert(approval>0&&auth>approval&&off>auth&&schema>off&&backup>schema&&ledger>backup);
 assert.match(r,/env.CONTROL_PLANE_TOKEN.length<32/u);
 // A native-applied 0213 is admissible only when the actual deployed
 // ref-only switches are OFF and the existing table is proven EMPTY by
 // exact D1 index/PK, quick/FK and forced-plan proof before any mutation.
 const native=r.indexOf('const applied0213=state.native_history_preflight.native_applied_ids.includes("0213")');
 const fullAudit=r.indexOf("auditStep30213EmptyRefStructure(checked)",native);
 const admission=r.indexOf("admitUnsigned0213AppliedEmptyResume({",fullAudit);
 assert(native>off&&fullAudit>native&&admission>fullAudit&&backup>admission);
 assert.match(r,/UNSIGNED_0213_PRECHECK_READ_BUDGET_EXCEEDED/u);
 assert.match(r,/refOnlyOffProof:state.production_ref_only_live_off_proof/u);
 assert.match(r,/status:"FRESH_PROVIDER_PRE_DDL_NO_REFERENCE_TABLE_STRUCTURAL_ONLY"/u);
 assert.match(r,/original_pointer_bytes_or_hmac_claimed:false/u);
 assert.match(r,/NONEMPTY_PRODUCTION_POINTER_REQUIRES_EXISTING_HMAC/u);
 assert.match(r,/const empty=inspectPointerProofCount\(result.rows\)/u);
 assert(r.indexOf("NONEMPTY_PRODUCTION_POINTER_REQUIRES_EXISTING_HMAC")>
  r.indexOf("inspectPointerProofCount(result.rows)"));
 assert.doesNotMatch(r,/env.PHASE2H_SHADOW_R2_REFERENCE_HMAC_KEY/u);
});

test("protected runner must never revoke canary HOLD or auto promote/migrate on CI",()=>{
 const runner=readFileSync("scripts/ops/run-step3-protected-d1-migrations.mjs","utf8");
 assert.match(runner,/GEOMACRO_STEP3_APPLY/u);
 assert.match(runner,/GEOMACRO_STEP3_EXACT_SHA/u);
 assert.match(runner,/runShadowBillableProbe/u);
 assert.ok(runner.includes('refreshedGate(state,"BEFORE_"+step.id)'));
 assert.match(runner,/captureDurableD1Checkpoint/u);
 assert.match(runner,/ensureLedger/u);
 assert.match(runner,/verifyRealPhase2hPointerRows/u);
 assert.doesNotMatch(runner,/pre-step3-bookmark\\.private\\.json/u);
 assert.match(runner,/post_migration_readback_explicit_PASS/u);
 assert.doesNotMatch(runner,/unlinkSync\(/u);
 assert.doesNotMatch(runner,/time-travel","restore"/u);
});


test("0119 website risk-source index is admitted only as exact migration DDL and full lineage",async()=>{
 const {
  STEP3_0204_EXPECTED_EXISTING_INDEXES,
  STEP3_0119_WEBSITE_REVIEWED_INDEX,
  STEP3_0212_ADDITIVE_INDEX_LINEAGE,
  verifyStep30119WebsiteIndexDDL,
  admitStep30204SupportedIntegrity
 }=await import("../lib/d1-step3-supported-integrity.mjs");
 const extraName="idx_website_risk_raw_source_scan";
 assert.equal(STEP3_0119_WEBSITE_REVIEWED_INDEX,extraName);
 const validDDL=[{name:extraName,type:"index",
  tbl_name:"website_derived_intelligence",
  sql:"CREATE INDEX IF NOT EXISTS idx_website_risk_raw_source_scan\n ON website_derived_intelligence(first_seen_at,id)"}];
 assert.equal(verifyStep30119WebsiteIndexDDL(validDDL),true);
 for(const changed of [
  [],[{...validDDL[0],sql:"CREATE INDEX idx_website_risk_raw_source_scan ON website_derived_intelligence(published_at,id)"}],
  [{...validDDL[0],tbl_name:"other_table"}],
  [{...validDDL[0],type:"view"}],
  [validDDL[0],validDDL[0]]
 ])assert.throws(()=>verifyStep30119WebsiteIndexDDL(changed),/0119_WEBSITE_INDEX_DDL_UNVERIFIED/u);
 function proofs({elevenNine=false,twentyTwelve=false,unreviewed=false}={}){
  return Object.entries(STEP3_0204_EXPECTED_EXISTING_INDEXES).map(([table,names])=>{
   const list=[...names,...(twentyTwelve?
    STEP3_0212_ADDITIVE_INDEX_LINEAGE[table]:[]),
    ...(elevenNine&&table==="website_derived_intelligence"?[extraName]:[]),
    ...(unreviewed&&table==="website_derived_intelligence"?["idx_unreviewed"]:[])];
   return {
    table,status:"PASS_D1_SUPPORTED_QUICK_FK_ALL_INDEX_LOGICAL_PROOF",
    total_existing_indexes:list.length,
    index_proofs:list.map(index=>({
     index,rows_compared:3,unique_verified:index.startsWith("sqlite_autoindex_"),
     status:"PASS_BOUNDED_FULL_INDEX_KEY_AND_ROW_PARITY"
    })),
    reviewed_0119_index_ddl_verified:elevenNine,
    all_indexes_including_unique_considered:true,
    real_sqlite_integrity_check_claimed:false,
    physical_file_integrity_claimed:false,
    raw_private_content_exposed:false
   };
  });
 }
 const legacy=admitStep30204SupportedIntegrity(proofs());
 assert.equal(legacy.existing_index_count,12);
 const real=admitStep30204SupportedIntegrity(proofs({elevenNine:true}));
 assert.equal(real.existing_index_count,13);
 assert.equal(real.reviewed_0119_production_website_index_verified,true);
 assert.equal(real.production_release_authorized,false);
 const shadowPost=admitStep30204SupportedIntegrity(proofs({twentyTwelve:true}));
 assert.equal(shadowPost.existing_index_count,14);
 const prodPost=admitStep30204SupportedIntegrity(proofs({elevenNine:true,twentyTwelve:true}));
 assert.equal(prodPost.existing_index_count,15);
 assert.equal(prodPost.all_0212_v3_additive_index_memberships_verified,true);
 for(const bad of [
  proofs({elevenNine:true}).map((p,i)=>i===2?{...p,reviewed_0119_index_ddl_verified:false}:p),
  proofs({elevenNine:true,unreviewed:true}),
  proofs({twentyTwelve:true}).map((p,i)=>i===2?{...p,index_proofs:p.index_proofs.filter(x=>x.index!=="idx_website_derived_category_clock_v3"),total_existing_indexes:p.total_existing_indexes-1}:p),
  proofs({elevenNine:true,twentyTwelve:true}).map((p,i)=>i===1?{
   ...p,index_proofs:p.index_proofs.map((x,j)=>j===0?{...x,rows_compared:0}:x)}:p)
 ])assert.throws(()=>admitStep30204SupportedIntegrity(bad),/STEP3_ALL_INDEX_/u);
 const migration=readFileSync(
  "workers/control-plane/migrations/0119_derived_risk_gate_website_raw.sql","utf8");
 assert.match(migration,
  /CREATE INDEX IF NOT EXISTS idx_website_risk_raw_source_scan\s+ON website_derived_intelligence\(first_seen_at,id\)/u);
 const runner=readFileSync("scripts/ops/run-step3-protected-d1-migrations.mjs","utf8");
 assert.match(runner,/verifyStep3ReviewedExtraIndexDDL\(table,name,query\(sql,2\)\)/u);
 assert.match(runner,/provider_0204_index_registry=integrity\.map/u);
 assert.match(runner,/provider_0212_index_lineage_registry=lineageInputs\.map/u);
 assert.doesNotMatch(runner,/report\.provider_0204_index_registry=integrity;/u);
 assert.match(runner,/auditStep30204IndexLineage\(table,checked\)/u);
 assert.match(runner,/lineage\.existing_index_count!==/u);
 assert.match(runner,/14\+lineage\.reviewed_extra_index_count/u);
});

test("Nov 10 real production 15-index pre-0212 registry has exact reviewed 0110/0117/0119 DDL",async()=>{
 const {
  STEP3_0204_EXPECTED_EXISTING_INDEXES,
  STEP3_PRE0212_REVIEWED_EXTRA_INDEXES,
  STEP3_0212_ADDITIVE_INDEX_LINEAGE,
  verifyStep3ReviewedExtraIndexDDL,
  admitStep30204SupportedIntegrity
 }=await import("../lib/d1-step3-supported-integrity.mjs");
 const DDL=[
  {table:"private_osint_news_25h",
   name:"idx_private_osint_unified_country_category_clock",
   sql:"CREATE INDEX idx_private_osint_unified_country_category_clock\n ON private_osint_news_25h(country_iso3,category,native_feed_published_at DESC,item_id DESC)",
   file:"workers/control-plane/migrations/0110_unified_private_osint_evidence_index.sql"},
  {table:"private_osint_news_25h",
   name:"idx_osint_derived_discovery_cursor",
   sql:"CREATE INDEX idx_osint_derived_discovery_cursor\n ON private_osint_news_25h(first_seen_at,item_id)",
   file:"workers/control-plane/migrations/0117_derived_risk_gate_discovery_bridge.sql"},
  {table:"website_derived_intelligence",
   name:"idx_website_risk_raw_source_scan",
   sql:"CREATE INDEX idx_website_risk_raw_source_scan\n ON website_derived_intelligence(first_seen_at,id)",
   file:"workers/control-plane/migrations/0119_derived_risk_gate_website_raw.sql"}
 ];
 for(const d of DDL){
  const source=readFileSync(d.file,"utf8");
  assert(source.includes(d.sql.replace("CREATE INDEX ","CREATE INDEX IF NOT EXISTS ")));
  const row={name:d.name,type:"index",tbl_name:d.table,sql:d.sql};
  assert.equal(verifyStep3ReviewedExtraIndexDDL(d.table,d.name,[row]),true);
  for(const wrong of [
    {...row,sql:row.sql.replace("CREATE INDEX","CREATE UNIQUE INDEX")},
    {...row,sql:row.sql.replace(" ON "," ON not_the_table ")},
    {...row,tbl_name:"another_table"},
    {...row,name:"idx_unreviewed"}
  ])assert.throws(()=>verifyStep3ReviewedExtraIndexDDL(d.table,d.name,[wrong]),
   /STEP3_ALL_INDEX_REVIEWED_EXTRA_INDEX_DDL_UNVERIFIED/u);
 }
 function build({extra=true,future=false,unreviewed=false}={}){
  const entries=Object.entries(STEP3_0204_EXPECTED_EXISTING_INDEXES);
  return entries.map(([table,names])=>{
   const extras=extra?STEP3_PRE0212_REVIEWED_EXTRA_INDEXES[table]:[];
   const list=[...names,...extras,...(future?STEP3_0212_ADDITIVE_INDEX_LINEAGE[table]:[]),
    ...(unreviewed&&table==="private_osint_news_25h"?["idx_unknown"]:[])];
   return {
    table,status:"PASS_D1_SUPPORTED_QUICK_FK_ALL_INDEX_LOGICAL_PROOF",
    total_existing_indexes:list.length,
    index_proofs:list.map(index=>({
     index,rows_compared:table==="private_osint_news_25h"?2787:44,
     unique_verified:index.startsWith("sqlite_autoindex_"),
     status:"PASS_BOUNDED_FULL_INDEX_KEY_AND_ROW_PARITY"
    })),
    reviewed_0119_index_ddl_verified:extra&&table==="website_derived_intelligence",
    reviewed_extra_index_ddl_verified:Object.fromEntries(extras.map(x=>[x,true])),
    all_indexes_including_unique_considered:true,
    real_sqlite_integrity_check_claimed:false,
    physical_file_integrity_claimed:false,
    raw_private_content_exposed:false
   };
  });
 }
 const actual=admitStep30204SupportedIntegrity(build());
 assert.equal(actual.existing_index_count,15);
 assert.equal(actual.status,
  "PASS_D1_SUPPORTED_0204_PLUS_0110_0117_0119_FIFTEEN_INDEX_LOGICAL_INTEGRITY");
 assert.equal(actual.exact_15_index_pre0212_production_lineage_verified,true);
 assert.equal(actual.production_release_authorized,false);
 const post=admitStep30204SupportedIntegrity(build({future:true}));
 assert.equal(post.existing_index_count,17);
 assert.equal(post.exact_17_index_post0212_production_lineage_verified,true);
 assert.equal(post.all_0212_v3_additive_index_memberships_verified,true);
 assert.equal(admitStep30204SupportedIntegrity(build({extra:false})).existing_index_count,12);
 assert.equal(admitStep30204SupportedIntegrity(build({extra:false,future:true})).existing_index_count,14);
 const invalid=[
  build({unreviewed:true}),
  build().map((p,i)=>i===0?{...p,
    reviewed_extra_index_ddl_verified:{...p.reviewed_extra_index_ddl_verified,
     idx_osint_derived_discovery_cursor:false}}:p),
  build({future:true}).map((p,i)=>i===2?{...p,
    index_proofs:p.index_proofs.filter(x=>x.index!=="idx_website_derived_category_clock_v3"),
    total_existing_indexes:p.total_existing_indexes-1}:p),
  build().map((p,i)=>i===1?{...p,index_proofs:p.index_proofs.map((x,j)=>
    j===0?{...x,rows_compared:0}:x)}:p)
 ];
 for(const bad of invalid)
  assert.throws(()=>admitStep30204SupportedIntegrity(bad),/STEP3_ALL_INDEX_/u);
 const runner=readFileSync("scripts/ops/run-step3-protected-d1-migrations.mjs","utf8");
 assert.match(runner,/auditStep30204IndexLineage\(table,checked\)/u);
 assert.match(runner,/lineage\.reviewed_extra_index_count/u);
 assert.match(runner,/verified_0204_0212_lineage_indexes:lineage\.existing_index_count/u);
 assert.match(runner,/verifyStep3ReviewedExtraIndexDDL\(table,name,query\(sql,2\)\)/u);
});

test("0204 Shadow-reviewed exact 12-index provider proof is mandatory before APPLIED ledger can reconcile",async()=>{
 const {STEP3_0204_EXPECTED_EXISTING_INDEXES,admitStep30204SupportedIntegrity}
  =await import("../lib/d1-step3-supported-integrity.mjs");
 const proofs=Object.entries(STEP3_0204_EXPECTED_EXISTING_INDEXES).map(([table,names])=>({
  table,status:"PASS_D1_SUPPORTED_QUICK_FK_ALL_INDEX_LOGICAL_PROOF",
  total_existing_indexes:names.length,
  index_proofs:names.map(name=>({index:name,
   rows_compared:3,
   unique_verified:name.startsWith("sqlite_autoindex_"),
   status:"PASS_BOUNDED_FULL_INDEX_KEY_AND_ROW_PARITY"})),
  all_indexes_including_unique_considered:true,
  real_sqlite_integrity_check_claimed:false,
  physical_file_integrity_claimed:false,
  raw_private_content_exposed:false
 }));
 const ok=admitStep30204SupportedIntegrity(proofs);
 assert.equal(ok.existing_index_count,12);
 assert.equal(ok.status,"PASS_D1_SUPPORTED_0204_THREE_TABLE_TWELVE_INDEX_INTEGRITY");
 assert.equal(ok.sqlite_integrity_check_claimed,false);
 assert.equal(ok.production_release_authorized,false);
 assert.throws(()=>admitStep30204SupportedIntegrity(proofs.slice(1)),/0204_THREE_TABLES_REQUIRED/);
 assert.throws(()=>admitStep30204SupportedIntegrity(proofs.map((p,i)=>i? p:{
  ...p,total_existing_indexes:p.total_existing_indexes-1})),/0204_EXACT_INDEX_CARDINALITY_UNVERIFIED/);
 assert.throws(()=>admitStep30204SupportedIntegrity(proofs.map((p,i)=>i? p:{
  ...p,index_proofs:p.index_proofs.map((x,j)=>j?x:{...x,rows_compared:0})})),/0204_INDEX_REGISTRY_OR_ROW_PARITY_UNVERIFIED/);
 assert.throws(()=>admitStep30204SupportedIntegrity(proofs.map((p,i)=>i? p:{
  ...p,index_proofs:p.index_proofs.map(x=>({...x,unique_verified:false}))})),/0204_UNIQUE_INDEX_PROOF_REQUIRED/);
 assert.throws(()=>admitStep30204SupportedIntegrity(proofs.map((p,i)=>i? p:{
  ...p,real_sqlite_integrity_check_claimed:true})),/0204_TABLE_SUPPORTED_PROOF_UNVERIFIED/);
 const runner=readFileSync("scripts/ops/run-step3-protected-d1-migrations.mjs","utf8");
 assert.match(runner,/if\(step\.id==="0204"\)/u);
 assert.match(runner,/admitStep30204SupportedIntegrity\(integrity\)/u);
 assert.match(runner,/report\.composite_integrity_rows_read>3000000/u);
 assert.match(runner,/auditStep3AllIndexesCurrentRows\(table,/u);
 assert.match(runner,/FRESH_SAME_TARGET_REAL_PROVIDER_D1_READ_ONLY/u);
 assert.match(runner,/else if\(step\.id==="0212"\)/u);
 assert.match(runner,/auditStep30212ExactHourlyCounter\(checked\)/u);
 assert.match(runner,/auditStep30212AllRawSourceIndexes\(checked\)/u);
 assert.match(runner,/admitStep30204SupportedIntegrity\(lineageInputs\)/u);
 assert.match(runner,/SUPPORTED_0212_CENSUS_AUDIT_READ_CAP_EXCEEDED/u);
 assert.match(runner,/0212_SOURCE_PARTIAL_INDEX_AND_HOURLY_PENDING_CONTRADICTION/u);
 assert.match(runner,/lineage\.existing_index_count<14/u);
 assert.match(runner,/lineage\.existing_index_count>17/u);
 assert.match(runner,/14\+lineage\.reviewed_extra_index_count/u);
 assert.match(runner,/source_original_B2_byte_readback_claimed:false/u);
 assert.match(runner,/independent_pointer_HMAC_R2_B2_and_worker_proofs_required:true/u);
 assert.match(runner,/UNREVIEWED_STEP3_MIGRATION_INTEGRITY_ID/u);
 assert.match(runner,/else if\(step\.id==="0211"\)/u);
 assert.match(runner,/auditStep30211WithoutRowidCounter\(checked\)/u);
 assert.match(runner,/auditStep30211SpoolSource\(checked\)/u);
 assert.match(runner,/PASS_EMPTY_SHADOW_STAGING_SCHEMA_AND_ZERO_COUNTERS_ONLY/u);
 assert.match(runner,/SUPPORTED_0211_COUNTER_AUDIT_READ_CAP_EXCEEDED/u);
 assert.match(runner,/b2_original_byte_readback_claimed:false/u);
 assert.match(runner,/production_release_authorized:false/u);
 assert.doesNotMatch(runner,/q\(config,"PRAGMA integrity_check\(/u);
 assert.match(runner,/else if\(step\.id==="0213"\)/u);
 assert.match(runner,/auditStep30213EmptyRefStructure\(checked\)/u);
 assert.match(runner,/auditStep3AllIndexes\("phase2h_raw_object_refs_v1",checked\)/u);
 assert.match(runner,/SUPPORTED_0213_REF_AUDIT_READ_CAP_EXCEEDED/u);
 assert.match(runner,/0213_NONEMPTY_REF_ALL_INDEX_KEY_PARITY_UNVERIFIED/u);
 assert.match(runner,/real_r2_hmac_pointer_verified_by_this_step:false/u);
 assert.match(runner,/real_b2_original_readback_verified_by_this_step:false/u);
 assert.match(runner,/independent_signing_and_worker_proof_required:true/u);
 assert.match(runner,/0213_CONCURRENT_REF_TABLE_CHANGE/u);
 assert.match(runner,/step3LedgerStatusSQL\(manifest,"VERIFIED"/u);
 assert.doesNotMatch(runner,/unlinkSync\(HOLD_FILE\)/u);
});

test("real Cloudflare native Time Travel checkpoint replaces optional Wrangler backend-label assertion without relaxing DDL holds",()=>{
 const runner=readFileSync("scripts/ops/run-step3-protected-d1-migrations.mjs","utf8");
 assert.match(runner,/summarizeD1BackendMetadata\(info\)/u);
 assert.match(runner,/D1_TIME_TRAVEL_BACKEND_EXPLICITLY_UNSUPPORTED/u);
 assert.match(runner,/backend.version_label==="alpha"/u);
 assert.match(runner,/backend.version_label==="UNRECOGNIZED"/u);
 assert.doesNotMatch(runner,/info\?\.version!=="production"/u);
 assert.match(runner,/checkpoint\.real_provider_bookmark_observed!==true/u);
 assert.match(runner,/checkpoint\.private_r2_encrypted_readback_verified!==true/u);
 assert.match(runner,/checkpoint\.signed_manifest_readback_verified!==true/u);
 assert.match(runner,/native_time_travel_provider_verified=true/u);
 const actualBookmark=runner.indexOf("checkpoint.real_provider_bookmark_observed!==true");
 const firstDdl=runner.indexOf("ensureLedger(config,manifests,state)");
 assert(actualBookmark>0&&firstDdl>actualBookmark,
  "actual native provider bookmark and immutable signed R2 recovery must precede DDL");
 assert.match(runner,/if\(!existsSync\(HOLD_FILE\)\)fail\("HOLD_REMOVED_DURING_STAGE2"\)/u);
});
