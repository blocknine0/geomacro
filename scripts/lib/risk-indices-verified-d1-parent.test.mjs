import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { assertVerifiedCurrentGlobalRiskD1Parent, assertPublishedRiskIndicesD1Readback } from "./risk-indices-verified-d1-parent.mjs";

const NOW = Date.parse("2026-10-15T06:00:00.000Z");
const sha = value => createHash("sha256").update(value).digest("hex");
function fixture() {
  const at = new Date(NOW - 10 * 60_000).toISOString();
  const reading = () => ({
    readingStatus: "current", readingAsOf: at,
    series: { "7D": { buckets: [{}, {}] }, "30D": { buckets: [{}, {}] } },
  });
  const value = {
    schema: "geomacro.public-global-risk-live.v1", source_project: "ldpwajisioljyjtojvfx",
    generated_at: new Date(NOW - 2 * 60_000).toISOString(),
    data: { methodologyVersion:"gri-v1.2.0",verificationStatus:"verified",
      auditPersisted:true,snapshotAsOf:at,
      proofHash:"a".repeat(64),evidenceHash:"b".repeat(64),calculationHash:"c".repeat(64),
      domainIndices:{geopolitics:reading(),macro:reading(),rare_earth:reading()} },
  };
  const payload_json = JSON.stringify(value);
  return {
    ok:true,product:"global-risk",schema:value.schema,
    generated_at:value.generated_at,source_as_of:at,
    expires_at:new Date(NOW + 80 * 60_000).toISOString(),
    proof_schema:"geomacro.public-global-risk-live-proof.v1",
    verification_mode:"direct-b2-readback",
    b2_object_key:"geomacro-evidence/v1/live/global-risk/latest.json.gz",
    b2_sha256:"d".repeat(64),payload_sha256:sha(payload_json),
    full_b2_readback_verified:true,exact_gzip_restore_verified:true,
    payload_json,
  };
}
function mutatePayload(source, mutate) {
  const parsed = JSON.parse(source.payload_json);
  mutate(parsed);
  source.payload_json = JSON.stringify(parsed);
  source.payload_sha256 = sha(source.payload_json);
}
test("accepts only an exact current direct-B2 D1 parent metadata fixture", () => {
  const parent = assertVerifiedCurrentGlobalRiskD1Parent(fixture(),NOW);
  assert.equal(parent.sourceAsOf,new Date(NOW-600000).toISOString());
});
test("rejects a stale original time regardless of new generated-at", () => {
  const f=fixture();f.source_as_of=new Date(NOW-91*60000).toISOString();
  assert.throws(()=>assertVerifiedCurrentGlobalRiskD1Parent(f,NOW),/SOURCE_CLOCK_OR_EXPIRY_INVALID/);
});
test("rejects current-proof overlay over old B2 baseline",()=>{
  const f=fixture(); f.proof_schema="geomacro.public-global-risk-current-proof.v1";
  assert.throws(()=>assertVerifiedCurrentGlobalRiskD1Parent(f,NOW),/DIRECT_B2_PROOF_REQUIRED/);
});
test("rejects missing actual B2 readback",()=>{
  const f=fixture();f.full_b2_readback_verified=false;
  assert.throws(()=>assertVerifiedCurrentGlobalRiskD1Parent(f,NOW),/DIRECT_B2_PROOF_REQUIRED/);
});
test("rejects mismatched payload digest",()=>{
  const f=fixture();f.payload_sha256="0".repeat(64);
  assert.throws(()=>assertVerifiedCurrentGlobalRiskD1Parent(f,NOW),/EXACT_PAYLOAD_HASH_INVALID/);
});
test("rejects a re-dated unsigned risk payload",()=>{
  const f=fixture();mutatePayload(f,p=>p.data.auditPersisted=false);
  assert.throws(()=>assertVerifiedCurrentGlobalRiskD1Parent(f,NOW),/VERIFIED_GRI_LINEAGE_INVALID/);
});
for(const category of ["geopolitics","macro","rare_earth"]){
  test("rejects missing current domain "+category,()=>{
    const f=fixture();mutatePayload(f,p=>{p.data.domainIndices[category].readingStatus="last_verified"});
    assert.throws(()=>assertVerifiedCurrentGlobalRiskD1Parent(f,NOW),/DOMAIN_.*_NOT_CURRENT/);
  });
}
test("rejects missing 7D domain continuity",()=>{
  const f=fixture();mutatePayload(f,p=>p.data.domainIndices.macro.series["7D"].buckets=[]);
  assert.throws(()=>assertVerifiedCurrentGlobalRiskD1Parent(f,NOW),/DOMAIN_MACRO_NOT_CURRENT/);
});


function indicesReadbackFixture() {
  const source=new Date(NOW-10*60_000).toISOString();
  const generated=new Date(NOW-2*60_000).toISOString();
  const parentPayload="a".repeat(64),parentB2="b".repeat(64);
  const value={
    schema:"geomacro.public-risk-indices-live.v1",
    generated_at:generated,source_project:"ldpwajisioljyjtojvfx",
    parent_global_risk_payload_sha256:parentPayload,
    parent_global_risk_b2_sha256:parentB2,
    data:{snapshotAsOf:source,parentMethodologyVersion:"gri-v1.2.0"},
  };
  const payloadJson=JSON.stringify(value);
  const proof={
    schema:"geomacro.public-risk-indices-live-proof.v1",
    live_key:"geomacro-evidence/v1/live/risk-indices-independent/latest.json.gz",
    snapshot_as_of:source,generated_at:generated,
    parent_global_risk_payload_sha256:parentPayload,
    parent_global_risk_b2_sha256:parentB2,
    compressed_sha256:"c".repeat(64),
    full_b2_readback_verified:true,exact_gzip_restore_verified:true,
  };
  const snapshot={
    ok:true,product:"risk-indices",schema:value.schema,
    proof_schema:proof.schema,
    verification_mode:"direct-b2-readback",
    b2_object_key:proof.live_key,b2_sha256:proof.compressed_sha256,
    payload_sha256:sha(payloadJson),payload_json:payloadJson,
    generated_at:generated,source_as_of:source,
    expires_at:new Date(NOW+80*60_000).toISOString(),
    current_b2_readback_verified:true,
    full_b2_readback_verified:true,exact_gzip_restore_verified:true,
  };
  return {snapshot,value,proof,payloadJson,now:NOW};
}
test("checks independent D1 public row against exact B2 bytes and GRI v1.2 parent",()=>{
  const d=indicesReadbackFixture();
  const verified=assertPublishedRiskIndicesD1Readback(d.snapshot,d);
  assert.equal(verified.parentPayloadSha256,d.value.parent_global_risk_payload_sha256);
  assert.equal(verified.b2Sha256,d.proof.compressed_sha256);
});
test("rejects independently read D1 rows with stale or altered object identity",()=>{
  const mutations=[
    d=>{d.snapshot.payload_json=JSON.stringify({...d.value,malicious:true})},
    d=>{d.snapshot.b2_sha256="d".repeat(64)},
    d=>{d.snapshot.current_b2_readback_verified=false},
    d=>{d.snapshot.verification_mode="independent-gri-proof-over-b2-baseline"},
    d=>{d.snapshot.expires_at=new Date(NOW-10_000).toISOString()},
    d=>{d.snapshot.source_as_of=new Date(NOW-91*60_000).toISOString()},
    d=>{d.value.parent_global_risk_b2_sha256="f".repeat(64)},
    d=>{d.proof.parent_global_risk_payload_sha256="f".repeat(64)},
  ];
  for(const mutate of mutations) {
    const data=indicesReadbackFixture();
    mutate(data);
    assert.throws(()=>assertPublishedRiskIndicesD1Readback(data.snapshot,data),
      /INDICES_D1_PUBLIC_READBACK_/);
  }
});
