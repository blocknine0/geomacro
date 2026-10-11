import { createHash, generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { GeomacroRiskObject } from "./risk-object-contract";
import { canonicalRiskObjectJson, signRiskObject, verifyRiskObjectSignature } from "./risk-object-signing.server";
import {
  federicoReviewEnvelopeFromPrepared,
  prepareOnDemandPartnerArtifact,
} from "./on-demand-partner-artifact.server";

const NOW = new Date("2026-10-11T13:00:00.000Z");
const GENERATED = "2026-10-11T12:00:00.000Z";
function unsigned(): GeomacroRiskObject {
  return {
    schema_version: "gro-1.1",
    object_id: "gro_country_CHN_on_demand_contract_test",
    subject: { type:"country",id:"CHN",name:"China" },
    issuer: "Geomacro",
    methodology_version:"country-risk-v0.1.0-pilot",
    risk: {score:61,label:"ELEVATED",previous_score:58,delta:3,direction:"escalating"},
    attribution:[],
    confidence:0.88,
    evidence:[],
    evidence_coverage:null,
    evidence_summary:{event_count:0,evidence_count:0,independent_source_count:0},
    observed_at:GENERATED,
    generated_at:GENERATED,
    expires_at:"2026-10-11T15:00:00.000Z",
    commercial_eligibility:{status:"VERIFIED",reason_codes:[]},
    verification:{status:"VERIFIED",reason_codes:[],last_verified_at:GENERATED},
    integrity:{
      input_hash:"a".repeat(64),data_hash:"b".repeat(64),
      calculation_hash:"c".repeat(64),payload_hash:null,
      canonicalization:null,signature:null,signature_scheme:null,
      signing_key_id:null,
    },
    provenance:{
      structure_versions:[],scoring_versions:[],
      relevance_versions:[],country_versions:[],story_versions:[],
    },
  };
}
function strictObject(): GeomacroRiskObject {
  const data=unsigned();
  data.evidence=[{
    event_id:"event-1",title:"Officially verified country event",
    event_type:"trade_policy",severity:55,confidence:90,
    relevance_weight:0.8,material_evidence_at:"2026-10-11T11:45:00.000Z",
    direction:"escalating",last_seen_at:GENERATED,
    evidence_count:2,independent_source_count:2,
    source_ids:["publisher-a","publisher-b"],
    source_record_ids:["publisher-item-1","publisher-item-2"],
    evidence_refs:[],source_families:["first-issuer","second-issuer"],
  }];
  data.evidence_summary={event_count:1,evidence_count:2,independent_source_count:2};
  data.decision_readiness={
    status:"READY",policy_version:"federico-strict-evidence-v1",
    reason_codes:[],evaluated_at:GENERATED,
  };
  data.provenance.reproducibility={
    manifest_version:"v1",calculation_namespace:"federico_strict_evidence_v1",
    selection_policy:{
      max_evidence_age_hours:6,max_included_evidence_items:1,
      high_impact_max_evidence_age_hours:3,high_impact_severity_threshold:80,
      minimum_high_impact_independent_sources:2,
      source_independence_method:"issuer-family",
      relevance_method:"country",source_family_map_version:"v1",
      source_family_map:{},
    },
    calculation_input:{events:[{
      id:"event-1",event_type:"trade_policy",driver:"trade_policy",
      severity:55,confidence:90,relevance_weight:0.8,
    }]},
    score_components:{
      total_weight:0.8,raw_score:61,rounded_score:61,aggregate_confidence:0.88,
    },
    hash_inputs:{data_projection:{}},
  };
  return data;
}
function signed(input:GeomacroRiskObject=unsigned()) {
  const pair=generateKeyPairSync("ed25519");
  const keyId="on-demand-local-test";
  const material={
    key_id:keyId,
    private_key_pkcs8_b64:pair.privateKey.export({format:"der",type:"pkcs8"}).toString("base64"),
  };
  const publicKeys={
    [keyId]:pair.publicKey.export({format:"der",type:"spki"}).toString("base64"),
  };
  return {
    object:signRiskObject(input,material),verificationKeys:publicKeys,material,
  };
}
describe("Supabase-free on-demand partner signed GRO handoff",()=>{
  it("prepares exact canonical signed bytes and reproducible record hash without a data store",()=>{
    const {object,verificationKeys}=signed();
    const options={profile:"CANONICAL" as const,now:NOW,verification_keys:verificationKeys};
    const first=prepareOnDemandPartnerArtifact(object,options);
    const second=prepareOnDemandPartnerArtifact(object,options);
    const canonical=canonicalRiskObjectJson(object);
    expect(first.signed_risk_object_json).toBe(canonical);
    expect(first.record_sha256)
      .toBe(createHash("sha256").update(canonical).digest("hex"));
    expect(first.record_sha256).toBe(second.record_sha256);
    expect(first.payload_hash).toBe(object.integrity.payload_hash);
    expect(first.locally_verified).toBe(true);
    expect(first.deployed_registry_verified).toBe(false);
    expect(first.external_partner_approved).toBe(false);
    expect(first.live_review_authorized).toBe(false);
    expect(first.payment_authorized).toBe(false);
    expect(first.persistence_performed).toBe(false);
    expect(verifyRiskObjectSignature(JSON.parse(first.signed_risk_object_json),verificationKeys).valid)
      .toBe(true);
    expect(()=>federicoReviewEnvelopeFromPrepared(first))
      .toThrow("ON_DEMAND_FEDERICO_REVIEW_ENVELOPE_INVALID");
  });
  it("rejects tamper, expired object, missing trusted key, unverified rights and missing observed_at",()=>{
    const {object,verificationKeys}=signed();
    const opts={profile:"CANONICAL" as const,now:NOW,verification_keys:verificationKeys};
    expect(()=>prepareOnDemandPartnerArtifact({
      ...object,risk:{...object.risk,score:99},
    },opts)).toThrow("COMMERCIAL_RISK_OBJECT_NOT_DELIVERABLE");
    expect(()=>prepareOnDemandPartnerArtifact(object,{...opts,verification_keys:{}}))
      .toThrow("COMMERCIAL_RISK_OBJECT_NOT_DELIVERABLE");
    expect(()=>prepareOnDemandPartnerArtifact(object,{...opts,now:new Date("2026-10-11T17:00:00Z")}))
      .toThrow("COMMERCIAL_RISK_OBJECT_NOT_DELIVERABLE");
    const noRights=signed({...unsigned(),commercial_eligibility:{status:"UNVERIFIED",reason_codes:[]}});
    expect(()=>prepareOnDemandPartnerArtifact(noRights.object,{
      ...opts,verification_keys:noRights.verificationKeys,
    })).toThrow("COMMERCIAL_RISK_OBJECT_NOT_DELIVERABLE");
    expect(()=>prepareOnDemandPartnerArtifact({...object,observed_at:undefined},opts))
      .toThrow("ON_DEMAND_PARTNER_ORIGINAL_OBSERVATION_MISSING");
  });
  it("keeps the Federico profile strict and emits its existing review envelope without submitting",()=>{
    const {object,verificationKeys}=signed(strictObject());
    const handoff=prepareOnDemandPartnerArtifact(object,{
      profile:"FEDERICO_STRICT",now:NOW,verification_keys:verificationKeys,
    });
    const review=federicoReviewEnvelopeFromPrepared(handoff);
    expect(review.as_of).toBe(object.observed_at);
    expect(canonicalRiskObjectJson(review.risk_object)).toBe(handoff.signed_risk_object_json);
    expect(verifyRiskObjectSignature(review.risk_object,verificationKeys).valid).toBe(true);
    expect(handoff.external_partner_approved).toBe(false);
    expect(handoff.live_review_authorized).toBe(false);
    expect(handoff.persistence_performed).toBe(false);
    expect(handoff.payment_authorized).toBe(false);
  });
  it("never promotes an unclassified zero-severity strict event or stale original",()=>{
    const bad=strictObject();
    const calc=bad.provenance.reproducibility!.calculation_input as
      {events:Array<{severity:number;driver:string}>};
    calc.events[0].severity=0;
    calc.events[0].driver="other";
    const s=signed(bad);
    expect(()=>prepareOnDemandPartnerArtifact(s.object,{
      profile:"FEDERICO_STRICT",now:NOW,verification_keys:s.verificationKeys,
    })).toThrow(/FEDERICO_STRICT publication blocked/);
    const stale=strictObject();
    stale.evidence[0].material_evidence_at="2026-10-10T04:00:00.000Z";
    const st=signed(stale);
    expect(()=>prepareOnDemandPartnerArtifact(st.object,{
      profile:"FEDERICO_STRICT",now:NOW,verification_keys:st.verificationKeys,
    })).toThrow("ON_DEMAND_FEDERICO_ORIGINAL_NOT_FRESH");
  });
  it("maintains no Supabase/B2/commerce calls and no implicit PREDGE activation",()=>{
    // This utility performs local preparation only. PREDGE is not an activated
    // adapter in this repository; receiver consent/contract remains external.
    const source=requireSource();
    expect(source).not.toContain("requireRiskSupabase");
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("settleCoinbase");
    expect(source).not.toContain("putObject");
  });
});
function requireSource():string {
  return readFileSync("src/lib/on-demand-partner-artifact.server.ts","utf8");
}
