import test from "node:test";
import assert from "node:assert/strict";
import {reconcilePublicHotRecovery,recoverySummary} from "./reconcile-public-hot-recovery.mjs";

const NOW=new Date("2026-10-20T12:00:00.000Z");
const meta={schema:"geomacro.d1-hot-metadata-expiry-diagnostic.v1",products:{}};
for(const name of ["intelligence","global-risk","risk-indices"])
 meta.products[name]={state:"METADATA_REJECTED",
  reasons:["SOURCE_TOO_OLD","EXPIRED"],source_age_minutes:15123,
  expiry_in_minutes:-15000,metadata_eligible:false,
  live_freshness_eligible:false,secret:"DO_NOT_LEAK"};
const pub={schema:"geomacro.public-serving-readonly-diagnostic.v1",ok:false,
 site:{historical_b2_baseline_readable:{intelligence:false,global_risk:false,risk_indices:false}},
 products:{intelligence:{http_status:503},"global-risk":{http_status:503},
  "risk-indices":{http_status:503}},secret:"DO_NOT_LEAK"};

test("expired production inputs and empty approved hints stay red and scrubbed",()=>{
 const r=reconcilePublicHotRecovery({publicDiagnostic:pub,metadata:meta,now:NOW});
 assert.equal(r.production_health_verified,false);
 assert.equal(r.intelligence_machine_input_hint,"MISSING_OR_STALE_HINT");
 assert.equal(r.gri_independent_input_hint,"MISSING_OR_STALE_HINT");
 assert.equal(r.products["global-risk"].expiry_in_minutes,-15000);
 assert.equal(r.products["risk-indices"].public_hot_http_status,503);
 assert(r.blocking.includes("GRI_INDEPENDENT_SIGNED_INPUT_AND_CERTIFICATES_NOT_READY"));
 assert.equal(r.payments,0);assert.equal(r.b2_gets,0);
 assert(!JSON.stringify(r).includes("DO_NOT_LEAK"));
 assert(!recoverySummary(r).includes("DO_NOT_LEAK"));
});
test("structurally valid approved hints are NOT signing, B2 or public serving proof",()=>{
 const env={MACHINE_INTELLIGENCE_READY_INPUT_SHA256:"a".repeat(64),
  MACHINE_INTELLIGENCE_READY_APPROVED_AT:"2026-10-20T11:50:00.000Z",
  GRI_READY_REVIEWED_SHA256:"b".repeat(64),
  GRI_READY_CERTIFICATES_SHA256:"c".repeat(64),
  GRI_READY_APPROVED_AT:"2026-10-20T11:50:00.000Z"};
 const green={schema:meta.schema,products:{}};
 for(const name of ["intelligence","global-risk","risk-indices"])
  green.products[name]={state:"METADATA_ONLY_POSSIBLE",reasons:[],
   metadata_eligible:true,live_freshness_eligible:true,
   source_age_minutes:10,expiry_in_minutes:80};
 const r=reconcilePublicHotRecovery({metadata:green,publicDiagnostic:{...pub,ok:true},env,now:NOW});
 assert.equal(r.all_three_native_sources_current,true);
 assert.equal(r.intelligence_machine_input_hint,"VALID_POINTER_HINT_ONLY_NOT_SIGNED_PROOF");
 assert.equal(r.gri_independent_input_hint,"VALID_POINTER_HINT_ONLY_NOT_SIGNED_PROOF");
 assert.equal(r.product_published,false);
 assert.equal(r.signed_proof_verified_by_this_report,false);
 assert(!JSON.stringify(r).includes("aaaa"));
});
test("unknown D1 query result never implies current signed product",()=>{
 const r=reconcilePublicHotRecovery({now:NOW});
 assert.equal(r.metadata_audit_available,false);
 assert.equal(r.products.intelligence.metadata_state,"UNOBSERVED");
 assert.equal(r.products.intelligence.native_source_freshness_eligible,false);
 assert.equal(r.production_health_verified,false);
});
test("stale or future approval hints cannot spuriously unblock publisher",()=>{
 const env={MACHINE_INTELLIGENCE_READY_INPUT_SHA256:"a".repeat(64),
  MACHINE_INTELLIGENCE_READY_APPROVED_AT:"2026-10-19T11:50:00.000Z",
  GRI_READY_REVIEWED_SHA256:"b".repeat(64),
  GRI_READY_CERTIFICATES_SHA256:"c".repeat(64),
  GRI_READY_APPROVED_AT:"2026-10-20T12:10:00.000Z"};
 const r=reconcilePublicHotRecovery({metadata:meta,publicDiagnostic:pub,env,now:NOW});
 assert.equal(r.intelligence_machine_input_hint,"MISSING_OR_STALE_HINT");
 assert.equal(r.gri_independent_input_hint,"MISSING_OR_STALE_HINT");
});
