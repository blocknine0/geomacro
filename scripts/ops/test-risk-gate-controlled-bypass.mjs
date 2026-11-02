import test from "node:test";
import assert from "node:assert/strict";
import {
 parseControlledGateRequest,dedupeObservedPublications,determineControlledGate,
 CONTROLLED_GATE_PRODUCTS
} from "../../workers/control-plane/src/risk-gate-controlled-bypass.mjs";

const now=Date.parse("2026-11-02T14:19:00.000Z");
const valid=(tier="SIGNAL")=>({
 request_id:"req_88319a",subject:{type:"corridor",id:"bab-el-mandeb"},
 product_tier:tier,requested_at:new Date(now).toISOString()
});
const empty={
 items:[],source_count:0,domains_observed:0,inferred_origin_groups:0,
 independent_origins_verified:0,authoritative_first_party_publications:0
};
test("contract uses the supplied separate SKU prices",()=>{
 assert.equal(CONTROLLED_GATE_PRODUCTS.CORE.price_usd,"0.50");
 assert.equal(CONTROLLED_GATE_PRODUCTS.SIGNAL.price_usd,"0.02");
 assert.equal(CONTROLLED_GATE_PRODUCTS.POLICY.price_usd,null);
});
test("strict default accepts valid corridor but rejects unauthenticated override claims",()=>{
 assert.equal(parseControlledGateRequest(valid(),now).policy_mode,"STRICT");
 assert.equal(parseControlledGateRequest({...valid(),client_override:{action:"PASS",acknowledged:true}},now),null);
 assert.equal(parseControlledGateRequest({...valid(),product_tier:"POLICY"},now),null);
});
test("lenient override requires POLICY tier, explicit action and acknowledgment",()=>{
 const o={...valid("POLICY"),policy_mode:"LENIENT",client_override:{action:"PASS",acknowledged:true}};
 assert.ok(parseControlledGateRequest(o,now));
 assert.equal(parseControlledGateRequest({...o,client_override:{action:"PASS",acknowledged:false}},now),null);
 assert.equal(parseControlledGateRequest({...o,product_tier:"CORE"},now),null);
});
test("two publications of same wire title count one inferred origin; zero verified origins",()=>{
 const observations=dedupeObservedPublications([
  {id:"a".repeat(64),source_id:"wire_a",url:"https://one.example.org/x",title_hash:"f".repeat(64),published_at:new Date(now).toISOString()},
  {id:"b".repeat(64),source_id:"wire_b",url:"https://two.example.org/y",title_hash:"f".repeat(64),published_at:new Date(now+600000).toISOString()}
 ]);
 assert.equal(observations.source_count,2);
 assert.equal(observations.domains_observed,2);
 assert.equal(observations.inferred_origin_groups,1);
 assert.equal(observations.independent_origins_verified,0);
 const output=determineControlledGate({request:{...valid(),policy_mode:"STRICT"},observed:observations});
 assert.equal(output.gate_decision,"GATE_ADVISORY");
 assert.equal(output.billing.chargeable,false);
 assert.equal(output.verification_state.event_truth_verified,false);
});
test("official authority source creates publication observation, not a confirmed incident",()=>{
 const publications=dedupeObservedPublications([{
  id:"c".repeat(64),source_id:"federal_reserve",
  url:"https://www.federalreserve.gov/newsevents/pressreleases/example.htm",
  title_hash:"e".repeat(64),published_at:new Date(now).toISOString()
 }]);
 const gate=determineControlledGate({request:{...valid(),policy_mode:"STRICT"},observed:publications});
 assert.equal(gate.verification_state.status,"AUTHORITATIVE_PUBLICATION_OBSERVED_EVENT_UNCONFIRMED");
 assert.equal(gate.gate_decision,"GATE_ADVISORY");
 assert.equal(gate.verification_state.event_truth_verified,false);
});
test("HMAC cannot itself turn unverifiable signals into hard gate",()=>{
 const v=determineControlledGate({request:{...valid(),policy_mode:"STRICT"},observed:empty,
  verified_decision:"PAUSE",gro:null});
 assert.equal(v.gate_decision,"GATE_ADVISORY");
 assert.equal(v.execution_authorized,false);
});
test("a real verified signed GRO plus a policy decision may make a hard gate",()=>{
 const v=determineControlledGate({request:{...valid("CORE"),policy_mode:"STRICT"},observed:empty,
  verified_decision:"PAUSE",gro:{confidence:0.91,evidence_summary:{independent_source_count:2}}});
 assert.equal(v.gate_decision,"GATE_BLOCKED");
 assert.equal(v.verification_state.event_truth_verified,true);
 assert.equal(v.billing.chargeable,false);
});
test("lenient client override stays explicit and never grants execution authority",()=>{
 const v=determineControlledGate({
  request:{...valid("POLICY"),policy_mode:"LENIENT",client_override:{action:"PASS",acknowledged:true}},
  observed:empty
 });
 assert.equal(v.gate_decision,"GATE_ADVISORY");
 assert.equal(v.client_policy_decision,"OVERRIDE_PASS");
 assert.equal(v.client_override_applied,true);
 assert.equal(v.execution_authorized,false);
});
