import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {SHADOW_ONLY_REVIEWED_BLOBS,PRODUCTION_B2_ACK_REVIEWED_BLOBS,gitBlobSha1,auditPhase2hRawConsumers}
 from "../ops/audit-phase2h-raw-canonical-readers.mjs";

test("new Step3 raw readers are exactly pinned, shadow/local only, never certified production",()=>{
 const audit=auditPhase2hRawConsumers();
 assert.deepEqual(audit.unknown_unreviewed,[]);
 assert.equal(audit.complete_reference_only_cutover_verified,false);
 assert.equal(audit.production_ref_flag_must_remain_off,true);
 assert.equal(audit.full_b2_archive_parity_not_proven,true);
 assert.equal(Object.keys(SHADOW_ONLY_REVIEWED_BLOBS).length,4);
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

test("immutable Step3 B2 seed cannot point its raw-json read at canonical production D1",()=>{
 const path="scripts/ops/seed-step3-shadow-archived-original.mjs";
 const source=readFileSync(path,"utf8");
 assert.equal(gitBlobSha1(source),SHADOW_ONLY_REVIEWED_BLOBS[path].blob);
 assert.match(source,/e\.D1_DATABASE_ID===e\.GEOMACRO_D1_SHADOW_DATABASE_ID/u);
 assert.match(source,/GEOMACRO_STEP3_SHADOW_REHEARSAL_APPROVED/u);
 assert.match(source,/GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN/u);
 assert.match(source,/e\.GEOMACRO_D1_SHADOW_DATABASE_ID\+"\/query"/u);
});

test("reviewed production B2 ACK is exact-blob pinned, write-only and never certifies R2 cutover",()=>{
 const path="scripts/lib/phase2h-atomic-bulk-archive-ack.mjs";
 const source=readFileSync(path,"utf8");
 const review=PRODUCTION_B2_ACK_REVIEWED_BLOBS[path];
 assert.ok(review);
 assert.equal(gitBlobSha1(source),review.blob);
 assert.notEqual(gitBlobSha1(source+"\\n"),review.blob);
 assert.match(source,/UPDATE phase2h_private_raw_news/u);
 assert.match(source,/r\\.raw_json=e\\.raw_json/u);
 assert.match(source,/eligible\\(total\\)/u);
 assert.match(source,/RETURNING record_id/u);
 assert.doesNotMatch(source,/DELETE FROM phase2h_private_raw_news/u);
 const report=auditPhase2hRawConsumers();
 const item=report.files.find(x=>x.file===path);
 assert.equal(item?.classification,review.classification);
 assert.equal(item.reviewed_shadow_blob_exact,true);
 assert.equal(item.source_select_raw_from_d1,false);
 assert.deepEqual(report.unknown_unreviewed,[]);
 assert.equal(report.complete_reference_only_cutover_verified,false);
 assert.equal(report.full_b2_archive_parity_not_proven,true);
});
