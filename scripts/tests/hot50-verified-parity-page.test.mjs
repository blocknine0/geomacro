import {test} from "node:test";
import assert from "node:assert/strict";
import {verifyHot50ArchivedPage} from "../../workers/control-plane/src/hot50-verified-parity-page.mjs";

const sha="a".repeat(64),candidate="b".repeat(64);
const uri="b2://spool/20261106/source1/bundle_20261106T000000Z_"+sha+".json.gz";
function mock({itemStatus="D1_COMMITTED",remoteTampered=false}={}) {
  const outbox={batch_id:sha,b2_uri:uri,b2_object_sha256:sha,item_count:1};
  const item={candidate_sha256:candidate,source_id:"source1",bundle_offset:0,bundle_length:42,
    state:itemStatus,d1_committed_at:"2026-11-06T00:00:00.000Z",
    acked_at:"2026-11-06T00:00:00.000Z",article_source:"source1",
    b2_archive_uri:uri,article_status:"ADMITTED"};
  const db={prepare(sql){return {bind(){return {
    all:async()=>({results:sql.includes("FROM p0b_archive_outbox")?[outbox]:
      sql.includes("FROM ingestion_spool_queue")?[item]:[]}),
    first:async()=>({bundle_sha256:sha,item_count:1,state:"D1_COMMITTED",
      d1_committed_at:item.d1_committed_at,acked_at:item.acked_at}),
  }}}}};
  const manager={readBundleVerified:async()=>({
    batchSha256:remoteTampered?candidate:sha,
    items:[{candidateSha256:candidate,sourceId:"source1"}],
    index:[{candidateSha256:candidate,sourceId:"source1",byteOffset:0,byteLength:42}]
  })};
  return {DB:db,manager};
}
const endpoint="https://example.org/v1/internal/p0b/parity-verified-page";
test("authenticated GET/sha/D1 readback validates entire archived page",async()=>{
  const {DB,manager}=mock();
  const result=await verifyHot50ArchivedPage({DB},new URL(endpoint),{manager});
  const body=await result.json();
  assert.equal(result.status,200);
  assert.equal(body.checked_bundles,1);
  assert.equal(body.checked_candidates,1);
  assert.equal(body.b2_independent_get_decrypt_sha256_verified,true);
  assert.equal(body.d1_canonical_item_ack_readback_verified,true);
  assert.equal(body.full_bucket_list_verified,false);
});
test("tampered remote digest fails closed",async()=>{
  const {DB,manager}=mock({remoteTampered:true});
  const r=await verifyHot50ArchivedPage({DB},new URL(endpoint),{manager});
  assert.equal(r.status,503);
  assert.equal((await r.json()).full_parity_claimed,false);
});
test("unacknowledged D1 item cannot pass B2 parity",async()=>{
  const {DB,manager}=mock({itemStatus:"RETRY"});
  const r=await verifyHot50ArchivedPage({DB},new URL(endpoint),{manager});
  assert.equal(r.status,503);
  assert.equal((await r.json()).code,"P0B_PARITY_D1_ITEM_READBACK_MISMATCH");
});
test("malformed pagination is rejected before any storage read",async()=>{
  const r=await verifyHot50ArchivedPage({},new URL(endpoint+"?after=not-a-sha"));
  assert.equal(r.status,400);
});
