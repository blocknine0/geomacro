import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
test("public materialized Worker must import referenced cache-eligibility function",()=>{
 const source=readFileSync(new URL("../../workers/control-plane/src/index.mjs",import.meta.url),"utf8");
 assert.ok(source.includes('import {readPublicFreeD1Cached,eligiblePublicFreeD1CacheRequest} from "./public-free-d1-cache.mjs";'));
 assert.ok(source.includes("eligiblePublicFreeD1CacheRequest(request)"));
 assert.ok(source.includes("eligiblePublicFreeD1CacheRequest(pageRequest)"));
 assert.ok((source.split("eligiblePublicFreeD1CacheRequest(").length-1)>=5);
});
