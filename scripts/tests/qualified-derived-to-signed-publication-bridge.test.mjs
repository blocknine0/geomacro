import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(path,"utf8");
test("Hot50 feed and discovery workflows stay inside the legal facts-only intake policy",()=>{
 const hot=read(".github/workflows/hot50-direct-original-news-20m.yml");
 const pulse=read(".github/workflows/three-domain-30m-original-publisher-pulse.yml");
 const discovery=read(".github/workflows/derived-risk-gate-discovery-20m.yml");
 const rights=JSON.parse(read("config/four-lane-free-source-rights.v1.json"));
 const policy=JSON.parse(read("config/private-source-derivation-policy.v1.json"));
 assert.match(hot,/scripts\/lib\/four-lane-free-source-rights\.mjs/u);
 assert.match(hot,/config\/four-lane-free-source-rights\.v1\.json/u);
 assert.match(pulse,/probe-30min-three-domain-pulse\.mjs/u);
 assert.match(discovery,/scripts\/ops\/ingest-derived-risk-gate-discovery\.mjs/u);
 assert.equal(rights.schema,"geomacro.four-lane-free-source-rights.v1");
 assert.equal(policy.transformation.upstream_raw_article_redistribution,false);
 assert.equal(policy.paid_publication.signed_risk_object_requires_real_cryptographic_signature,true);
 assert.equal(policy.paid_publication.do_not_sell_explicitly_restricted_derived_reuse,true);
});

test("qualified GRO signing wakes automatically from verified publisher completion or an exact pinned event",()=>{
 const intelligence=read(".github/workflows/intelligence-machine-current.yml");
 const gro=read(".github/workflows/permanent-qualified-signed-gro-production.yml");
 assert.match(intelligence,/types: \[machine_intelligence_dual_signed_ready\]/u);
 assert.match(intelligence,/client_payload\.machine_b2_key/u);
 assert.match(intelligence,/client_payload\.machine_b2_sha256/u);
 assert.match(gro,/workflows: \["Deploy D1 Control Plane", "Machine Dual-Authority Intelligence Publication"\]/u);
 assert.match(gro,/run-automatic-gro-signing\.ts/u);
 assert.match(gro,/types: \[qualified_machine_gro_ready\]/u);
 assert.match(gro,/parsePinnedMachineGroInput/u);
});

test("reviewed GRI handoff auto-dispatches immutable B2 pins; publisher still verifies owner and reviewer authority",()=>{
 const stage=read("scripts/ops/stage-approved-reviewed-gri-private-b2.mjs");
 const gri=read(".github/workflows/gri-v12-supabase-free-reviewed-current.yml");
 assert.match(stage,/GRI_SIGNED_READY_DISPATCH_ACK==="YES_NO_FUNDS"/u);
 assert.match(stage,/event_type:"gri_reviewed_current_ready"/u);
 for(const key of ["reviewed_b2_key","reviewed_b2_sha256","reviewed_certificates_b2_key","reviewed_certificates_b2_sha256"])
  assert.ok(stage.includes(key),`missing immutable dispatch field: ${key}`);
 assert.match(gri,/types: \[gri_reviewed_current_ready\]/u);
 assert.match(gri,/verifyPallabSignedReadyGate|require-pallab-owner-signed-gri-ready/u);
 assert.match(gri,/GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256/u);
});

test("commercial evidence failures stay non-billable",()=>{
 const ledger=read("workers/control-plane/migrations/0131_predge_paid_risk_gate_addendum_v2.sql");
 const handler=read("workers/control-plane/src/predge-risk-gate-d1.mjs");
 assert.match(ledger,/entry_status IN \('INSUFFICIENT_EVIDENCE','UNDELIVERED','REFUNDED'\) AND billable=0 AND geomacro_fee_usdc_cents=0/u);
 assert.match(handler,/geomacroFeeUsdc=billable\?contractGeomacroFeeUsdc:"0\.00"/u);
});
