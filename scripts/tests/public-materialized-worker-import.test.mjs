import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
test("public materialized Worker must import referenced cache-eligibility function",()=>{
 const source=readFileSync(new URL("../../workers/control-plane/src/index.mjs",import.meta.url),"utf8");
 assert.match(source,/import \{readPublicFreeD1Cached,eligiblePublicFreeD1CacheRequest,\s*eligiblePublicFreeD1MaterializedNewsPageRequest\} from "\.\/public-free-d1-cache\.mjs";/);
 assert.ok(source.includes("eligiblePublicFreeD1CacheRequest(request)"));
 assert.ok(source.includes("eligiblePublicFreeD1CacheRequest(pageRequest)"));
 assert.ok(source.includes("const allowMaterialized=eligiblePublicFreeD1MaterializedNewsPageRequest(request)"));
 assert.ok(source.includes("readDerivedStories(env,Date.now(),0,legacyDelay,\n          allowMaterialized)"));
 assert.ok(source.includes("readDerivedStories(env,Date.now(),Number(q.get(\"offset\")),legacyDelay,\n          allowMaterialized)"));
});
