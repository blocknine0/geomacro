import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 MAX_DDL_ORIGINAL_ROWS_PER_TABLE,boundedMigrationSizeProbeSql,
 checkBoundedMigrationSizeProbe
} from "../ops/verify-protected-d1-migration-gate.mjs";
const old="Migration\n0204_d1_read_hotspot_optimization.sql";
const seed="Migration\n0211_p0b_daily_committed_count.sql";
const both=old+"\n0211_p0b_daily_committed_count.sql";
const make=(values,read=12004,written=0)=>JSON.stringify([{success:true,
 results:[values],meta:{rows_read:read,rows_written:written}}]);
test("migration DDL row probes bounded per source table; no generic 10k status indexes",()=>{
 assert.equal(MAX_DDL_ORIGINAL_ROWS_PER_TABLE,3000);
 const sql=boundedMigrationSizeProbeSql(both);
 assert.ok(sql.startsWith("SELECT "));
 assert.equal((sql.match(/EXISTS\(SELECT 1 FROM/g)??[]).length,4);
 assert.equal((sql.match(/LIMIT 1 OFFSET 3000/g)??[]).length,4);
 assert.ok(sql.includes("FROM private_osint_news_25h"));
 assert.ok(sql.includes("FROM private_osint_source_checks_24h"));
 assert.ok(sql.includes("FROM website_derived_intelligence"));
 assert.ok(sql.includes("FROM ingestion_spool_queue"));
 assert.ok(!sql.includes("FROM markets"));
 assert.ok(!sql.includes("COUNT(*)"));
});
test("remaining migration 0211 does not require unrelated 0204 table scanning",()=>{
 const sql=boundedMigrationSizeProbeSql(seed);
 assert.ok(sql.includes("spool_over"));
 assert.equal((sql.match(/EXISTS\(SELECT 1 FROM/g)??[]).length,1);
 assert.ok(!sql.includes("news_over"));
 const r=checkBoundedMigrationSizeProbe(seed,make({spool_over:0},3001));
 assert.equal(r.proven_table_count,1);
 assert.equal(r.index_write_cost_still_needs_provider_receipt,true);
});
test("oversized existing table never permits CREATE INDEX or full-queue seed",()=>{
 const row={news_over:0,checks_over:0,website_over:0,spool_over:0};
 const good=checkBoundedMigrationSizeProbe(both,make(row));
 assert.equal(good.status,"ORIGINAL_TABLES_BOUNDED");
 assert.equal(good.proven_table_count,4);
 assert.equal(good.account_wide_atomic_140k_guaranteed,false);
 for(const alias of Object.keys(row))
  assert.throws(()=>checkBoundedMigrationSizeProbe(both,make({...row,[alias]:1})),
   /MIGRATION_ORIGINAL_TABLE_TOO_LARGE_FOR_140K/);
});
test("reject malicious or incomplete provider proof and wrong billed-row metadata",()=>{
 const row={news_over:0,checks_over:0,website_over:0,spool_over:0};
 for(const response of [
 make(row,15001),make(row,12004,1),
 make({...row,extra:0}),make({...row,news_over:null}),
 make({...row,spool_over:2}),
 JSON.stringify([{success:false,results:[row],meta:{rows_read:100,rows_written:0}}]),
 JSON.stringify([{success:true,results:[],meta:{rows_read:0,rows_written:0}}]),
 JSON.stringify([{success:true,results:[row]}]),
 '{}','[]'
 ])assert.throws(()=>checkBoundedMigrationSizeProbe(both,response),/MIGRATION_/);
});
test("protected workflow delegates single-file repair to a bounded provider-gated runner",()=>{
 const flow=readFileSync(new URL("../../.github/workflows/geomacro-protected-d1-canary-preflight.yml",import.meta.url),"utf8");
 assert.ok(flow.includes("node scripts/ops/run-protected-d1-repair.mjs"));
 assert.ok(flow.includes("config/d1-hotspot-v2-canary.hold"));
 assert.ok(!flow.includes("d1 time-travel restore"));
});
