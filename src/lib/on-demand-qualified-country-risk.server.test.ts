import { createHash, generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { CountryRiskEventInput } from "./country-risk-engine";
import { canonicalRiskObjectJson, verifyRiskObjectSignature } from "./risk-object-signing.server";
import {
  scoreAndSignQualifiedOnDemandCountry,
  type VerifiedOnDemandCategory,
} from "./on-demand-qualified-country-risk.server";

const now=new Date("2026-10-11T13:00:00.000Z");

function trustedEvent(category:VerifiedOnDemandCategory):CountryRiskEventInput {
  const eventType=category==="geopolitics"?"sanctions":
    category==="macro"?"inflation":"critical_minerals";
  return {
    id:"verified-country-event-1",domain:category,event_type:eventType,
    title:"Two independent first-party announcements: governed test fixture",
    primary_country:"CHN",countries:["CHN"],severity:55,confidence:85,
    direction:"escalating",
    first_seen_at:"2026-10-11T11:15:00.000Z",
    last_seen_at:"2026-10-11T12:15:00.000Z",
    material_evidence_at:"2026-10-11T11:00:00.000Z",
    evidence_count:2,independent_source_count:2,corroboration_status:"CONFIRMED",
    source_ids:["official-one","official-two"],
    source_families:["issuer-one","issuer-two"],
    source_record_ids:["issuer-one-record","issuer-two-record"],
    content_hashes:["a".repeat(64),"b".repeat(64)],
    relevance_weight:0.9,
    evidence_refs:[],
    structure_version:"governed-structured-event-v1",
    structured_payload:{scoring_version:"on-demand-v1"},
  };
}
function keys(){
  const pair=generateKeyPairSync("ed25519");
  const keyId="on-demand-qualified-local-test";
  return {
    signingMaterial:{
      key_id:keyId,
      private_key_pkcs8_b64:pair.privateKey.export({format:"der",type:"pkcs8"}).toString("base64"),
    },
    verificationKeys:{
      [keyId]:pair.publicKey.export({format:"der",type:"spki"}).toString("base64"),
    },
  };
}
function fixture(category:VerifiedOnDemandCategory="geopolitics"){
  const event=trustedEvent(category);
  const qualifier=vi.fn(async(input:{
    category:VerifiedOnDemandCategory;
    country_iso3:string;
    evidence_sha256:string;
    events:ReadonlyArray<CountryRiskEventInput>;
  })=>({
    schema:"geomacro.on-demand-qualified-events.v1" as const,
    category:input.category,country_iso3:input.country_iso3,
    exact_evidence_sha256:input.evidence_sha256,
    event_ids:input.events.map(x=>x.id).sort(),
    independent_claims_verified:true as const,
    verified_commercial_rights:true as const,
    event_commercial_eligibility:input.events.map(x=>({
      event_id:x.id,status:"DERIVED_ONLY" as const,
      reason_codes:["approved_derived_distribution_contract"],
    })),
  }));
  return {
    input:{category,country_iso3:"CHN",country_name:"China",events:[event],now},
    deps:{...keys(),qualifyEvidence:qualifier},
    qualifier,
  };
}
describe("private on-demand qualified event -> existing GRO scorer -> signature",()=>{
  for(const category of ["geopolitics","macro","rare_earth"] as const){
    it(`produces deterministic signed country risk from synthetic certified ${category} fixture, never a real-source claim`,async()=>{
      const {input,deps,qualifier}=fixture(category);
      const prepared=await scoreAndSignQualifiedOnDemandCountry(input,deps);
      const replay=await scoreAndSignQualifiedOnDemandCountry(input,deps);
      const parsed=JSON.parse(prepared.signed_risk_object_json);
      expect(prepared.record_sha256).toBe(replay.record_sha256);
      expect(prepared.record_sha256)
        .toBe(createHash("sha256").update(prepared.signed_risk_object_json).digest("hex"));
      expect(canonicalRiskObjectJson(parsed)).toBe(prepared.signed_risk_object_json);
      expect(parsed.schema_version).toBe("gro-1.1");
      expect(parsed.subject.id).toBe("CHN");
      expect(parsed.evidence).toHaveLength(1);
      expect(parsed.evidence_summary.independent_source_count).toBe(2);
      expect(parsed.risk.score).toBeGreaterThan(0);
      expect(parsed.verification.status).toBe("VERIFIED");
      expect(parsed.commercial_eligibility.status).toBe("VERIFIED");
      expect(parsed.observed_at).toBe(now.toISOString());
      expect(verifyRiskObjectSignature(parsed,deps.verificationKeys).valid).toBe(true);
      expect(qualifier).toHaveBeenCalledTimes(2);
      expect(prepared.profile).toBe("CANONICAL");
      expect(prepared.external_partner_approved).toBe(false);
      expect(prepared.live_review_authorized).toBe(false);
      expect(prepared.payment_authorized).toBe(false);
      expect(prepared.persistence_performed).toBe(false);
    });
  }
  it("fails closed without backend qualifier, not a customer-supplied green flag",async()=>{
    const {input,deps}=fixture();
    await expect(scoreAndSignQualifiedOnDemandCountry(input,{
      ...deps,qualifyEvidence:undefined as never,
    })).rejects.toThrow("ON_DEMAND_TRUSTED_QUALIFIER_REQUIRED");
    await expect(scoreAndSignQualifiedOnDemandCountry(input,{
      ...deps,qualifyEvidence:async()=>null,
    })).rejects.toThrow("ON_DEMAND_QUALIFICATION_NOT_VERIFIED");
  });
  it("rejects stale, future, undated, wrong-country, unknown-domain or uncategorized scores",async()=>{
    const base=fixture();
    const altered=[
      {...trustedEvent("geopolitics"),material_evidence_at:"2026-10-10T03:00:00Z"},
      {...trustedEvent("geopolitics"),material_evidence_at:"2026-10-11T15:00:00Z"},
      {...trustedEvent("geopolitics"),material_evidence_at:undefined},
      {...trustedEvent("geopolitics"),primary_country:"USA"},
      {...trustedEvent("macro")},
      {...trustedEvent("geopolitics"),severity:0},
      {...trustedEvent("geopolitics"),relevance_weight:0},
      {...trustedEvent("geopolitics"),corroboration_status:"UNCONFIRMED" as const},
    ];
    for(const event of altered) {
      await expect(scoreAndSignQualifiedOnDemandCountry({
        ...base.input,events:[event],
      },base.deps)).rejects.toThrow(/ON_DEMAND_QUALIFIED_/);
    }
    expect(base.qualifier).not.toHaveBeenCalled();
  });
  it("rejects false independence, duplicate IDs and unsupported freeform keys",async()=>{
    const base=fixture();
    await expect(scoreAndSignQualifiedOnDemandCountry({
      ...base.input,events:[{...trustedEvent("geopolitics"),source_families:["issuer-one","issuer-one"]}],
    },base.deps)).rejects.toThrow("ON_DEMAND_QUALIFIED_INDEPENDENT_EVIDENCE_MISSING");
    await expect(scoreAndSignQualifiedOnDemandCountry({
      ...base.input,events:[trustedEvent("geopolitics"),trustedEvent("geopolitics")],
    },base.deps)).rejects.toThrow("ON_DEMAND_QUALIFIED_EVENT_UNVERIFIED");
  });
  it("rejects rights mismatch and forged hash even from a failing qualifier",async()=>{
    const base=fixture();
    await expect(scoreAndSignQualifiedOnDemandCountry(base.input,{
      ...base.deps,
      qualifyEvidence:async(input)=>({
        schema:"geomacro.on-demand-qualified-events.v1",category:input.category,
        country_iso3:input.country_iso3,exact_evidence_sha256:"a".repeat(64),
        event_ids:input.events.map(x=>x.id),
        independent_claims_verified:true,verified_commercial_rights:true,
        event_commercial_eligibility:input.events.map(x=>({
          event_id:x.id,status:"VERIFIED",reason_codes:[],
        })),
      }),
    })).rejects.toThrow("ON_DEMAND_QUALIFICATION_NOT_VERIFIED");
    await expect(scoreAndSignQualifiedOnDemandCountry(base.input,{
      ...base.deps,
      qualifyEvidence:async(input)=>({
        schema:"geomacro.on-demand-qualified-events.v1",category:input.category,
        country_iso3:input.country_iso3,exact_evidence_sha256:input.evidence_sha256,
        event_ids:input.events.map(x=>x.id),
        independent_claims_verified:true,verified_commercial_rights:true,
        event_commercial_eligibility:input.events.map(x=>({
          event_id:x.id,status:"UNVERIFIED",reason_codes:["licence_missing"],
        })),
      }),
    })).rejects.toThrow("ON_DEMAND_QUALIFICATION_RIGHTS_NOT_VERIFIED");
  });
  it("rejects an event modified by the qualifier before signing",async()=>{
    const base=fixture();
    await expect(scoreAndSignQualifiedOnDemandCountry(base.input,{
      ...base.deps,
      qualifyEvidence:async(input)=>{
        input.events[0].severity=100;
        return {
          schema:"geomacro.on-demand-qualified-events.v1",
          category:input.category,country_iso3:input.country_iso3,
          exact_evidence_sha256:input.evidence_sha256,
          event_ids:input.events.map(x=>x.id),
          independent_claims_verified:true,verified_commercial_rights:true,
          event_commercial_eligibility:input.events.map(x=>({
            event_id:x.id,status:"VERIFIED" as const,reason_codes:[],
          })),
        };
      },
    })).rejects.toThrow("ON_DEMAND_QUALIFIED_EVIDENCE_CHANGED");
  });
  it("retains separation from Supabase, B2, live partner review and x402 payments",()=>{
    const source=readFileSync("src/lib/on-demand-qualified-country-risk.server.ts","utf8");
    for(const forbidden of [
      "requireRiskSupabase","settleCoinbaseX402","fetch(","persistRiskObject",
      "readB2","writeB2","INVINO_API_KEY","payment-signature",
    ])expect(source).not.toContain(forbidden);
  });
});
