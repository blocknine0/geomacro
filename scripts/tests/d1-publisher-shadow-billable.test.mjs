import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {BULK_SQL,SINGLE_SQL,providerUsage,syntheticPublisherRows,
 verifiedShadowConfig} from "../ops/verify-d1-publisher-billable-shadow.mjs";

const uuidA="00000000-0000-4000-8000-000000000001";
const uuidB="00000000-0000-4000-8000-000000000002";
const config={GEOMACRO_D1_SHADOW_TARGET_APPROVED:"YES",
 CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),
 CLOUDFLARE_API_TOKEN:"not-a-real-provider-token-0123456789",
 GEOMACRO_D1_SHADOW_DATABASE_ID:uuidB,D1_DATABASE_ID:uuidA};

test("native billing metadata is mandatory; never infer writes from SQL statement count",()=>{
 assert.deepEqual(providerUsage({success:true,result:[{success:true,meta:{
  rows_read:125,rows_written:0,changes:0}}]}),{
  rows_read:125,rows_written:0,changes:0});
 for(const bad of [
  {success:true,result:[{success:true,meta:{changes:50}}]},
  {success:true,result:[{success:true,meta:{rows_read:1,rows_written:-1}}]},
  {success:false,result:[{success:true,meta:{rows_read:2,rows_written:0}}]}
 ])assert.throws(()=>providerUsage(bad),/D1_SHADOW_NATIVE_BILLABLE_META_MISSING/u);
});
test("strict shadow guard rejects absent approval and production D1 identity collision",()=>{
 assert.deepEqual(verifiedShadowConfig(config).shadow,uuidB);
 assert.throws(()=>verifiedShadowConfig({...config,D1_DATABASE_ID:uuidB}),/DEDICATED_SHADOW/u);
 assert.throws(()=>verifiedShadowConfig({...config,GEOMACRO_D1_SHADOW_TARGET_APPROVED:"NO"}),/DEDICATED_SHADOW/u);
 assert.throws(()=>verifiedShadowConfig({...config,GEOMACRO_D1_SHADOW_DATABASE_ID:"invalid"}),/DEDICATED_SHADOW/u);
});
test("50-item simulation uses same conditional no-op WHERE clause as production",()=>{
 const rows=syntheticPublisherRows("shadow-test",new Date("2026-11-08T07:00:00.000Z"));
 assert.equal(rows.length,50);
 assert.equal(new Set(rows.map(x=>x[0])).size,50);
 assert.ok(rows.every(x=>x.length===6&&x[0].startsWith("macro-")));
 assert.match(BULK_SQL,/FROM json_each\(\?\) AS j WHERE 1/u);
 assert.match(BULK_SQL,/website_derived_intelligence\.story_json <> excluded\.story_json/u);
 assert.match(SINGLE_SQL,/website_derived_intelligence\.story_json <> excluded\.story_json/u);
 const worker=readFileSync(new URL("../../workers/control-plane/src/website-derived-intelligence.mjs",
  import.meta.url),"utf8");
 assert.match(worker,/FROM json_each\(\?\) AS j WHERE 1/u);
 assert.match(worker,/website_derived_intelligence\.story_json <> excluded\.story_json/u);
});
