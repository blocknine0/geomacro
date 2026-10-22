import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
import {test} from "node:test";
const src=readFileSync(new URL("./legacy-edge-source-zero-b2-preflight.mjs",import.meta.url),"utf8");
test("no write, deletion or B2 data-plane paths",()=>{
 assert.match(src,/source_supabase_writes:0/);
 assert.match(src,/source_supabase_deletes:0/);
 assert.match(src,/old_supabase_deletion_authorized:false/);
 assert.match(src,/b2_requests:0/);
 assert.ok(!src.includes("api.backblazeb2.com"));
 assert.ok(!src.includes("s3.us-east-005.backblazeb2.com"));
 assert.ok(!src.includes("storage.from("));
 assert.ok(!src.includes('method:"DELETE"'));
 assert.ok(!src.includes('method:"POST"'));
 assert.ok(!src.includes('method:"PUT"'));
});
test("rejects silent partial deployed source access and exposes no source content",()=>{
 assert.match(src,/deployed_source_bodies_accessible!==10/);
 assert.match(src,/DEPLOYED_EDGE_BODY_FORMAT_INVALID/);
 assert.match(src,/return fail\("DEPLOYED_EDGE_LIST_MANIFEST_DRIFT"\)/);
 assert.doesNotMatch(src,/console\.log\(\s*body\s*\)/);
 assert.doesNotMatch(src,/writeFileSync\([^,\n]+,\s*body/);
});
