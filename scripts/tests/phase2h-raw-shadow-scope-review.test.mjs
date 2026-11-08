import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {SHADOW_ONLY_REVIEWED_BLOBS,gitBlobSha1,auditPhase2hRawConsumers}
 from "../ops/audit-phase2h-raw-canonical-readers.mjs";

test("new Step3 raw readers are exactly pinned, shadow/local only, never certified production",()=>{
 const audit=auditPhase2hRawConsumers();
 assert.deepEqual(audit.unknown_unreviewed,[]);
 assert.equal(audit.complete_reference_only_cutover_verified,false);
 assert.equal(audit.production_ref_flag_must_remain_off,true);
 assert.equal(audit.full_b2_archive_parity_not_proven,true);
 assert.equal(Object.keys(SHADOW_ONLY_REVIEWED_BLOBS).length,3);
 for(const [path,entry] of Object.entries(SHADOW_ONLY_REVIEWED_BLOBS)){
  const bytes=readFileSync(path,"utf8");
  assert.equal(gitBlobSha1(bytes),entry.blob);
  const item=audit.files.find(x=>x.file===path);
  assert.ok(item, "shadow/local source must be discovered");
  assert.equal(item.classification,entry.classification);
  assert.equal(item.reviewed_shadow_blob_exact,true);
  assert.equal(item.has_raw_json_token,true);
  assert.equal(item.has_sql_source_table,true);
 }
});
test("hash pin binds full git blob bytes (not just a file-name allowlist)",()=>{
 const path="scripts/lib/d1-step3-real-shadow-proofs.mjs";
 const original=readFileSync(path,"utf8");
 assert.equal(gitBlobSha1(original),SHADOW_ONLY_REVIEWED_BLOBS[path].blob);
 assert.notEqual(gitBlobSha1(original+"\n"),SHADOW_ONLY_REVIEWED_BLOBS[path].blob);
 assert.notEqual(gitBlobSha1(original.replace("SHADOW","PRODUCTION")),
   SHADOW_ONLY_REVIEWED_BLOBS[path].blob);
});
