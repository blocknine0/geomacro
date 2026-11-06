import test from "node:test";
import assert from "node:assert/strict";
import {productActivationTriggers,RISK_GATE_EVIDENCE_EVENTS}
 from "../../workers/control-plane/src/risk-gate-activation-triggers.mjs";
const now=Date.parse("2026-11-06T12:00:00Z");
const basic={status:"READY",category_observations:[{category:"GEOPOLITICS",observed_count:1}],
 signal_alerts:[{observed_at:"2026-11-06T11:30:00Z"}]};
test("Basic goes ACTIVE from one fresh observation without claiming verified fact",()=>{
 const r=productActivationTriggers(basic,{tier:"basic_focused",now});
 assert.equal(r.state,"ACTIVE");assert.deepEqual(r.pending_conditions,[]);
 assert.equal(r.payment_performed,false);
 assert.equal(r.source_discovery_does_not_verify_event,true);
 assert.deepEqual(r.category_triggers.map(x=>x.triggered),[true,false,false]);
});
test("Standard waits for actual independent same-event corroboration",()=>{
 const pending=productActivationTriggers({status:"INSUFFICIENT_CORROBORATION"},
  {tier:"standard",now});
 assert.deepEqual(pending.pending_conditions,
  ["CURRENT_INDEPENDENT_CORROBORATION_OR_SIGNED_THREE_DOMAIN_GRO"]);
 const ready=productActivationTriggers({status:"READY",independent_corroboration_verified:true},
  {tier:"standard",now});
 assert.equal(ready.ready_now,true);
});
test("Complex exposes distinct signed-GRO, B2 readback and seven-day triggers",()=>{
 const gro={verification:{status:"VERIFIED"},commercial_eligibility:{status:"VERIFIED"},
  generated_at:"2026-11-06T11:00:00Z",expires_at:"2026-11-06T14:00:00Z",
  attribution:[{driver:"conflict"},{driver:"inflation"},{driver:"critical_minerals"}],
  integrity:{signature_scheme:"Ed25519",signature:"x".repeat(80),
   payload_hash:"a".repeat(64)}};
 const archiveProof={archive_write_acknowledged:1,archive_readback_verified:1,
  archive_key:"geomacro-evidence/v1/private/proof.json",archive_sha256:"b".repeat(64)};
 const history=Array.from({length:7},(_,i)=>({proof_verified:true,
  day_utc:new Date(now-i*86400000).toISOString().slice(0,10),
  snapshot:{signed_gro_payload_sha256:"c".repeat(64),verified_unified_risk_score:.5}}));
 const waiting=productActivationTriggers({status:"SIGNED_GRO_OR_ARCHIVE_NOT_READY"},
  {tier:"complex_full",now,verifiedGro:gro,archiveProof,history:history.slice(0,3)});
 assert.equal(waiting.ready_now,false);assert.equal(waiting.signed_history_days_observed,3);
 assert.deepEqual(waiting.pending_conditions,["SEVEN_SIGNED_DAILY_HISTORY"]);
 const ready=productActivationTriggers({status:"READY"},
  {tier:"complex_full",now,verifiedGro:gro,archiveProof,history});
 assert.equal(ready.ready_now,true);assert.deepEqual(ready.pending_conditions,[]);
 assert.equal(ready.category_triggers.length,3);
 const expired=productActivationTriggers({status:"SIGNED_GRO_OR_ARCHIVE_NOT_READY"},
  {tier:"complex_full",now:now+4*3600000,verifiedGro:gro,archiveProof,history});
 assert.ok(expired.pending_conditions.includes("CURRENT_UNEXPIRED_GRO"));
 assert.equal(RISK_GATE_EVIDENCE_EVENTS.length,8);
});
