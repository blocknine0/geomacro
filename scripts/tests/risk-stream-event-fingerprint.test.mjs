import test from "node:test";
import assert from "node:assert/strict";
import {canonicalEventClaim,eventFingerprint} from "../lib/risk-stream-event-fingerprint.mjs";

const claim=(overrides={})=>({category:"GEOPOLITICS",country_iso3:"USA",
 event_identity:{country_iso3:"USA",event_type:"sanctions_policy",actor_id:"us_treasury",
  target_id:"foreign_bank",location_id:"washington_dc",occurred_at:"2026-11-14T10:15:00.000Z"},
 source_id:"publisher_one",publisher_root_domain:"one.example",...overrides});

test("same structured event across publishers reuses claim hash and stream fingerprint",()=>{
 const a=claim(),b=claim({source_id:"publisher_two",publisher_root_domain:"two.example"});
 assert.equal(canonicalEventClaim(a),canonicalEventClaim(b));
 assert.equal(eventFingerprint(a),eventFingerprint(b));
 assert.match(eventFingerprint(a),/^[a-f0-9]{64}$/u);
});

test("private-review event shape is normalized to the same stream category",()=>{
 const uppercase=claim();
 const privateReview={category:"geopolitics",event:uppercase.event_identity};
 assert.equal(canonicalEventClaim(uppercase),canonicalEventClaim(privateReview));
 assert.equal(eventFingerprint(uppercase),eventFingerprint(privateReview));
});

test("different structured events produce different fingerprints",()=>{
 const a=claim(),b=claim({event_identity:{...claim().event_identity,target_id:"another_bank"}});
 assert.notEqual(eventFingerprint(a),eventFingerprint(b));
});

test("reject category mismatch and ISO3 outside the canonical 250 entity set",()=>{
 assert.throws(()=>eventFingerprint(claim({category:"CRITICAL_MINERALS"})),
  /INVALID_OR_NONCANONICAL_CLAIM/u);
 assert.throws(()=>eventFingerprint(claim({country_iso3:"ZZZ",
  event_identity:{...claim().event_identity,country_iso3:"ZZZ"}})),
  /INVALID_OR_NONCANONICAL_CLAIM/u);
});
