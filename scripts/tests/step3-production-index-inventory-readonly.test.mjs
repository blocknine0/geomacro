import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 sanitizeIndexInventory,inspectProductionIndexInventory,
 INDEX_SQL,HISTORY_SQL
} from "../ops/step3-production-index-inventory-readonly.mjs";
const SHA="a".repeat(40),TOKEN="b".repeat(40),ACCOUNT="c".repeat(32);
const DB="db057ca9-9f6e-4957-ac28-144f3b798f9b";
const indexRows=[
 {tbl_name:"private_osint_news_25h",name:"idx_private_osint_news_clock",
  sql:"CREATE INDEX idx_private_osint_news_clock ON private_osint_news_25h(native_feed_published_at)"},
 {tbl_name:"website_derived_intelligence",name:"idx_website_risk_raw_source_scan",
  sql:"CREATE INDEX IF NOT EXISTS idx_website_risk_raw_source_scan ON website_derived_intelligence(first_seen_at,id)"},
 {tbl_name:"website_derived_intelligence",name:"sqlite_autoindex_website_derived_intelligence_1",sql:null}
];
const history=[{id:89,name:"0204_d1_read_hotspot_optimization.sql"},
 {id:96,name:"0211_p0b_daily_committed_count.sql"}];
const meta={rows_read:31,rows_written:0,changes:0};
test("only whitelisted read-only D1 SQL and metadata, not private source data",()=>{
 assert.match(INDEX_SQL,/^SELECT tbl_name,name,sql FROM sqlite_schema /u);
 assert.match(HISTORY_SQL,/^SELECT id,name FROM d1_migrations /u);
 assert.doesNotMatch(INDEX_SQL+HISTORY_SQL,/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|PRAGMA|REPLACE)\b/iu);
 const out=sanitizeIndexInventory(indexRows,history,[meta,meta],SHA);
 assert.equal(out.total_indexes,3);
 assert.equal(out.tables.website_derived_intelligence,2);
 assert.equal(out.provider_rows_written,0);
 assert.equal(out.canary_hold_removed,false);
 assert.equal(out.integrity_acceptance_not_inferred,true);
 assert.equal(out.indexes[1].name,"idx_website_risk_raw_source_scan");
 assert.deepEqual(out.native_migration_history,history);
 assert.equal(JSON.stringify(out).includes(TOKEN),false);
});
test("read-only provider calls use protected production D1 UUID and unchanged SQL",async()=>{
 const calls=[];
 const env={GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"blocknine0/geomacro",
  GITHUB_REF:"refs/heads/main",GITHUB_SHA:SHA,
  CLOUDFLARE_ACCOUNT_ID:ACCOUNT,CLOUDFLARE_API_TOKEN:TOKEN,
  D1_DATABASE_ID:DB};
 const response=rows=>({status:200,redirected:false,
  json:async()=>({success:true,result:[{success:true,results:rows,meta}]})});
 const out=await inspectProductionIndexInventory({
  env,holdExists:()=>true,fetchImpl:async(url,opts)=>{
   calls.push({url,opts});const sql=JSON.parse(opts.body).sql;
   return response(sql===INDEX_SQL?indexRows:history);
  }
 });
 assert.equal(out.status,"OBSERVED_PROVIDER_READ_ONLY");
 assert.equal(calls.length,2);
 assert(calls.every(x=>x.opts.method==="POST"));
 assert(calls.every(x=>x.url.endsWith("/d1/database/"+DB+"/query")));
 assert(calls.every(x=>x.opts.headers.Authorization==="Bearer "+TOKEN));
 assert.deepEqual(calls.map(x=>JSON.parse(x.opts.body).sql),[INDEX_SQL,HISTORY_SQL]);
 assert.equal(JSON.stringify(out).includes(TOKEN),false);
});
test("missing local bearer, provider auth denial and unmetered response fail closed",async()=>{
 const env={GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"blocknine0/geomacro",
  GITHUB_REF:"refs/heads/main",GITHUB_SHA:SHA,
  CLOUDFLARE_ACCOUNT_ID:ACCOUNT,CLOUDFLARE_API_TOKEN:TOKEN,D1_DATABASE_ID:DB};
 await assert.rejects(inspectProductionIndexInventory({
  env:{...env,CLOUDFLARE_API_TOKEN:""},holdExists:()=>true,
  fetchImpl:()=>{throw Error("MUST_NOT_FETCH")}
 }),/PROTECTED_SCOPE_OR_HOLD_UNVERIFIED/u);
 await assert.rejects(inspectProductionIndexInventory({
  env,holdExists:()=>false,fetchImpl:()=>{throw Error("MUST_NOT_FETCH")}
 }),/PROTECTED_SCOPE_OR_HOLD_UNVERIFIED/u);
 await assert.rejects(inspectProductionIndexInventory({
  env,holdExists:()=>true,fetchImpl:async()=>({status:403,redirected:false})
 }),/PROVIDER_AUTH_OR_HTTP_UNVERIFIED/u);
 assert.throws(()=>sanitizeIndexInventory(indexRows,history,
  [{rows_read:31,rows_written:1},meta],SHA),/PROVIDER_METERED_READ_ONLY_UNVERIFIED/u);
 assert.throws(()=>sanitizeIndexInventory([...indexRows,indexRows[0]],history,
  [meta,meta],SHA),/INDEX_ORDER_OR_DUPLICATE/u);
 assert.throws(()=>sanitizeIndexInventory(indexRows,[history[0],history[0]],
  [meta,meta],SHA),/NATIVE_HISTORY_UNVERIFIED/u);
});
test("GitHub manual workflow has exact-main, live protected env, HOLD, no apply/promote",()=>{
 const y=readFileSync(".github/workflows/step3-production-index-inventory-readonly.yml","utf8");
 assert.match(y,/workflow_dispatch:/u);
 assert.match(y,/READ_ONLY_STEP3_PRODUCTION_INDEX_INVENTORY/u);
 assert.match(y,/environment: production/u);
 assert.match(y,/github.ref == 'refs\/heads\/main'/u);
 assert.match(y,/secrets.CLOUDFLARE_API_TOKEN/u);
 assert.match(y,/node scripts\/ops\/step3-production-index-inventory-readonly.mjs/u);
 assert.match(y,/test -f config\/d1-hotspot-v2-canary\.hold/u);
 assert.doesNotMatch(y,/pull_request:|schedule:|--apply|versions deploy|gh secret set|continue-on-error/u);
});
