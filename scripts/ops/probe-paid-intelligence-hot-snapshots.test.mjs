import {test} from "node:test";
import assert from "node:assert/strict";
import {PAID_HOT_PRODUCTS,verifyPaidHotSnapshotProof,probePaidIntelligenceHotSnapshots} from "./probe-paid-intelligence-hot-snapshots.mjs";

const now=Date.parse("2026-10-31T12:00:00Z");
const hash="a".repeat(64);
const body=(product,minutes=30)=>({
  ok:true,product,source_as_of:new Date(now-minutes*60_000).toISOString(),
  expires_at:new Date(now+30*60_000).toISOString(),
  b2_sha256:hash,payload_sha256:hash,
  full_b2_readback_verified:true,exact_gzip_restore_verified:true,
  current_b2_readback_verified:true,current_b2_snapshot_promoted:true,
});
test("three current exact B2 readbacks are mandatory",()=>{
  for(const product of PAID_HOT_PRODUCTS)
    assert.equal(verifyPaidHotSnapshotProof(product,body(product),now).ready,true);
  assert.equal(verifyPaidHotSnapshotProof("global-risk",body("global-risk",61),now).ready,false);
  assert.equal(verifyPaidHotSnapshotProof("risk-indices",{
    ...body("risk-indices"),full_b2_readback_verified:false,
  },now).ready,false);
  assert.equal(verifyPaidHotSnapshotProof("global-risk",{
    ...body("global-risk"),current_b2_readback_verified:false,
    baseline_b2_readback_verified:true,
  },now).ready,false);
  assert.equal(verifyPaidHotSnapshotProof("global-risk",{
    ...body("global-risk"),
    proof_schema:"geomacro.public-global-risk-current-proof.v1",
    verification_mode:"independent-gri-proof-over-b2-baseline",
    current_b2_readback_verified:false,current_b2_snapshot_promoted:false,
    baseline_b2_readback_verified:true,baseline_exact_gzip_restore_verified:true,
  },now).ready,true);
  assert.equal(verifyPaidHotSnapshotProof("intelligence",{
    ...body("intelligence"),source_as_of:new Date(now+300_000).toISOString(),
  },now).ready,false);
});
test("one unavailable or stale hot product fails the complete no-funds probe",async()=>{
  let count=0;
  const fetchImpl=async url=>{
    count++;
    const product=String(url).split("/").at(-1);
    return{status:200,redirected:false,text:async()=>JSON.stringify(body(product,
      product==="risk-indices"?61:30))};
  };
  const r=await probePaidIntelligenceHotSnapshots({fetchImpl,now});
  assert.equal(count,3);assert.equal(r.ok,false);
  assert.equal(r.products.filter(p=>p.ready).length,2);
  assert.equal(r.publisher_dispatched,false);assert.equal(r.b2_requests,0);
});
