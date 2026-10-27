import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
test("public materialized Worker eligibility policy must be actually imported at runtime",()=>{
 const index=readFileSync(new URL("../../workers/control-plane/src/index.mjs",import.meta.url),"utf8");
 const statement=index.match(/import\\s*\\{([^}]+)\\}\\s*from\\s*["']\\.\\/public-free-d1-cache\\.mjs["']/u);
 assert.ok(statement,"Worker must import public cache module");
 assert.match(statement[1],/\\beligiblePublicFreeD1CacheRequest\\b/u);
 assert.ok((index.match(/eligiblePublicFreeD1CacheRequest\\(/gu)||[]).length>=4);
});
