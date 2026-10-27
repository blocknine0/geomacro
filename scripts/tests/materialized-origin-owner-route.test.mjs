import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

test("origin proof is owner-authenticated, direct canonical DB, and not CDN-cacheable",()=>{
 const source=readFileSync(new URL("../../workers/control-plane/src/index.mjs",import.meta.url),"utf8");
 const auth=source.indexOf("const auth = authorized(request, env)");
 const owner=source.indexOf('url.pathname==="/v1/internal/website-derived-news-origin"');
 assert.ok(auth>0&&owner>auth,"readback route must be behind owner auth");
 const scope=source.slice(owner,owner+1200);
 assert.ok(scope.includes('request.method==="GET"'));
 assert.ok(scope.includes('url.search==="?offset=500"'));
 assert.ok(scope.includes("readDerivedStories(env,Date.now(),500,0,false)"),
   "never use a derived materialization or R2 in canonical readback");
 assert.ok(scope.includes('headers.set("Cache-Control","no-store")'));
 assert.ok(scope.includes('headers.set("X-GeoMacro-Origin-Readback","d1-canonical")'));
 assert.ok(scope.includes('CANONICAL_READBACK_OFFLOAD_FORBIDDEN'));
 assert.ok(!scope.includes("readPublicFreeD1Cached"));
 assert.ok(!scope.includes("readPublicNewsR2Snapshot"));
});

test("private readback runner receives owner token, public proof stays anonymous",()=>{
 const workflow=readFileSync(new URL("../../.github/workflows/website-derived-news-cadence-backstop.yml",import.meta.url),"utf8");
 assert.ok(workflow.includes("Prove anonymous materialized read against owner-only direct D1 origin"));
 assert.ok(workflow.includes('GEOMACRO_COMMERCE_LEDGER_TOKEN: ${{ secrets.GEOMACRO_COMMERCE_LEDGER_TOKEN }}'));
 const proof=readFileSync(new URL("../ops/verify-public-d1-materialization-live.mjs",import.meta.url),"utf8");
 assert.ok(proof.includes('const OWNER_ROUTE="/v1/internal/website-derived-news-origin?offset=500"'));
 assert.ok(proof.includes('Authorization:"Bearer "+token'));
 assert.ok(proof.includes('protected_direct_d1_origin_route_verified:true'));
});
