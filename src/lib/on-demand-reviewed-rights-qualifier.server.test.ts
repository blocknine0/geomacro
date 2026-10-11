import { createHash,generateKeyPairSync,sign } from "node:crypto";
import { afterEach,describe,expect,it,vi } from "vitest";
import { canonicalRiskObjectJson,verifyRiskObjectSignature } from "./risk-object-signing.server";
import { scoreAndSignQualifiedOnDemandCountry } from "./on-demand-qualified-country-risk.server";
import { createReviewedRightsOnDemandQualifier } from "./on-demand-reviewed-rights-qualifier.server";
import type { CountryRiskEventInput } from "./country-risk-engine";
import type { B2CommercialSourceRight } from "./b2-live.server";
// The existing canonical same-event reviewer is intentionally reused here.
import { sameEventClaimHash,derivedCustomerRowSha256,
  qualificationReviewSigningBytes,SAME_EVENT_QUALIFICATION_SCHEMA,
} from "../../scripts/lib/independent-same-event-qualification.mjs";

const now=new Date("2026-10-11T11:00:00.000Z");
const sha=(s:string)=>createHash("sha256").update(s).digest("hex");
const pair=generateKeyPairSync("ed25519");
const trustedReviewerPublicKeyPem=pair.publicKey.export({type:"spki",format:"pem"}).toString();
const testEventIdentity={
  country_iso3:"USA",event_type:"central_bank_policy",
  actor_id:"federal_reserve",target_id:"us_rates",
  location_id:"washington_dc",occurred_at:"2026-10-11T09:55:00Z",
};
const claim=sameEventClaimHash("macro",testEventIdentity);
const fedHash=sha("Synthetic FED original HTML; NOT real evidence");
const ecbHash=sha("Synthetic ECB original HTML; NOT real evidence");
const row={
  id:"macro-scored-reviewed-001",category:"macro" as const,
  public_status:"verified_b2",severity:73,delta:2,
  source_title:"Geomacro finds reviewed monetary-policy shift elevates risk",
  summary:"Synthetic two-original claim for validating signer plumbing only",
  created_at:"2026-10-11T10:44:00Z",
  published_at:"2026-10-11T10:08:00Z",
};
const originalFed={
  url:"https://www.federalreserve.gov/newsevents/pressreleases/monetary20261011a.htm",
  publisher_host:"www.federalreserve.gov",
  publisher_organization_id:"federal_reserve",
  originating_reporting_organization_id:"federal_reserve",
  native_published_at_verified:true,original_published_at:"2026-10-11T10:08:00Z",
  original_article_content_verified:true,original_article_sha256:fedHash,
  independent_review_sha256:sha("fed reviewed bytes"),rights_receipt_sha256:sha("fed reviewed license"),
  commercial_derived_use_rights_verified:true,
  independently_authored_reporting_verified:true,reporting_position:"confirms",
  syndicated_from:null,original_publisher_url_verified:true,
  same_event_claim_sha256:claim,
  source_registry_id:"federal_reserve",
};
const originalEcb={
  ...originalFed,
  url:"https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp261011.en.html",
  publisher_host:"www.ecb.europa.eu",
  publisher_organization_id:"ecb",
  originating_reporting_organization_id:"ecb",
  original_published_at:"2026-10-11T10:12:00Z",
  original_article_sha256:ecbHash,
  independent_review_sha256:sha("ecb reviewed bytes"),rights_receipt_sha256:sha("ecb reviewed license"),
  source_registry_id:"ecb",
};
const event:CountryRiskEventInput={
  id:row.id,domain:"macro",event_type:"central_bank_policy",
  title:row.source_title,primary_country:"USA",countries:["USA"],
  severity:73,confidence:85,direction:"escalating",relevance_weight:0.9,
  first_seen_at:testEventIdentity.occurred_at,
  last_seen_at:"2026-10-11T10:12:00Z",
  material_evidence_at:testEventIdentity.occurred_at,
  evidence_count:2,independent_source_count:2,
  corroboration_status:"CONFIRMED",
  source_ids:["federal_reserve","ecb"],
  source_families:["federal_reserve","ecb"],
  source_record_ids:[fedHash,ecbHash],
  content_hashes:[fedHash,ecbHash],
  evidence_refs:[],structure_version:"reviewed-private-event-v1",
  structured_payload:{scoring_version:"country-risk-v0.1.0-pilot"},
};
const signing=generateKeyPairSync("ed25519");
const signingKeyId="on-demand-rights-qualified-local-fixture";
const deps={
  signingMaterial:{
    key_id:signingKeyId,
    private_key_pkcs8_b64:signing.privateKey.export({format:"der",type:"pkcs8"}).toString("base64"),
  },
  verificationKeys:{
    [signingKeyId]:signing.publicKey.export({format:"der",type:"spki"}).toString("base64"),
  },
};
function reviewedPackage(originals=[originalFed,originalEcb],related=event){
  const unsealed={
    schema:SAME_EVENT_QUALIFICATION_SCHEMA,
    event_id:row.id,category:"macro",event:testEventIdentity,
    same_event_claim_sha256:claim,
    independent_same_event_review_verified:true,
    same_event_reviewer_receipt_sha256:sha("exact same claim"),
    reviewed_derived_row_sha256:derivedCustomerRowSha256(row),
    reviewed_scoring_event_sha256:sha(canonicalRiskObjectJson(related)),
    counterevidence_review:{
      independent_counterevidence_review_completed:true,
      review_receipt_sha256:sha("screened independent negative originals"),
      reviewed_at:"2026-10-11T10:40:00Z",
      sources_screened:4,material_conflicts_detected:0,material_conflicts_resolved:0,
      unresolved_material_conflicts:0,retractions_detected:0,
    },
    evidence:originals,
  };
  return {
    ...unsealed,
    review_signature_base64:sign(null,qualificationReviewSigningBytes(unsealed),
      pair.privateKey).toString("base64"),
  };
}
function rights():B2CommercialSourceRight[] {
  return ["federal_reserve","ecb"].map(id=>({
    source_id:id,category:"macro",certification_state:"CERTIFIED",
    commercial_usage_status:"DERIVED_ONLY",enabled_for_ingestion:true,
    enabled_for_commercial_signals:true,raw_redistribution_allowed:false,
    attribution_required:false,licence_name:"Reviewed synthetic derived-only license",
  }));
}
function inputs(eventInput:CountryRiskEventInput=event,packageInput=reviewedPackage(),rows=rights()){
  return {
    scoring:{category:"macro" as const,country_iso3:"USA",
      country_name:"United States",now,events:[eventInput]},
    scorerDeps:{
      ...deps,
      qualifyEvidence:createReviewedRightsOnDemandQualifier({
        rows:[row],eventPackages:[packageInput],
      },{readRights:async()=>rows}),
    },
  };
}
afterEach(()=>vi.unstubAllEnvs());
describe("reuse real independent reviewer and B2 rights for private on-demand GRO",()=>{
  it("authenticates exact signed reviewed event and registry rights before synthetic signed macro GRO",async()=>{
    vi.stubEnv("GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM",trustedReviewerPublicKeyPem);
    const {scoring,scorerDeps}=inputs();
    const prepared=await scoreAndSignQualifiedOnDemandCountry(scoring,scorerDeps);
    const object=JSON.parse(prepared.signed_risk_object_json);
    expect(object.risk.score).toBeGreaterThan(0);
    expect(object.evidence_summary.independent_source_count).toBe(2);
    expect(object.commercial_eligibility.status).toBe("VERIFIED");
    expect(verifyRiskObjectSignature(object,deps.verificationKeys).valid).toBe(true);
    expect(prepared.payment_authorized).toBe(false);
    expect(prepared.external_partner_approved).toBe(false);
    expect(prepared.persistence_performed).toBe(false);
    expect(prepared.record_sha256).toBe(sha(prepared.signed_risk_object_json));
    const replay=await scoreAndSignQualifiedOnDemandCountry(scoring,scorerDeps);
    expect(replay.record_sha256).toBe(prepared.record_sha256);
  });
  it("requires pinned independent reviewer key and rejects untrusted signed key",async()=>{
    const {scoring,scorerDeps}=inputs();
    await expect(scoreAndSignQualifiedOnDemandCountry(scoring,scorerDeps))
      .rejects.toThrow("ON_DEMAND_QUALIFICATION_NOT_VERIFIED");
    const impostor=generateKeyPairSync("ed25519");
    vi.stubEnv("GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM",
      impostor.publicKey.export({type:"spki",format:"pem"}).toString());
    await expect(scoreAndSignQualifiedOnDemandCountry(scoring,scorerDeps))
      .rejects.toThrow("ON_DEMAND_QUALIFICATION_NOT_VERIFIED");
  });
  it("rejects rights absent, stale registry unavailable, wrong category and attribution unmet",async()=>{
    vi.stubEnv("GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM",trustedReviewerPublicKeyPem);
    for(const rows of [
      null,
      rights().slice(0,1),
      rights().map(x=>({...x,certification_state:"IN_REVIEW"})),
      rights().map(x=>({...x,enabled_for_commercial_signals:false})),
      rights().map(x=>({...x,commercial_usage_status:"INTERNAL_RESEARCH_ONLY"})),
      rights().map(x=>({...x,attribution_required:true})),
      rights().map(x=>({...x,category:"rare_earth"})),
      [...rights(),rights()[0]],
    ]){
      const i=inputs(event,reviewedPackage(),rows??[]);
      if(rows===null){
        i.scorerDeps.qualifyEvidence=createReviewedRightsOnDemandQualifier({
          rows:[row],eventPackages:[reviewedPackage()],
        },{readRights:async()=>null});
      }
      await expect(scoreAndSignQualifiedOnDemandCountry(i.scoring,i.scorerDeps))
        .rejects.toThrow("ON_DEMAND_QUALIFICATION_NOT_VERIFIED");
    }
  });
  it("rejects reviewer-signed row whose reviewed severity is modified in scoring input",async()=>{
    vi.stubEnv("GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM",trustedReviewerPublicKeyPem);
    const changed={...event,severity:99};
    await expect(scoreAndSignQualifiedOnDemandCountry(inputs(changed).scoring,
      inputs(changed).scorerDeps)).rejects.toThrow("ON_DEMAND_QUALIFICATION_NOT_VERIFIED");
  });
  it("rejects exact input/event signature tamper, wrong publisher mapping and syndication",async()=>{
    vi.stubEnv("GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM",trustedReviewerPublicKeyPem);
    const original=reviewedPackage();
    for(const changed of [
      {...original,reviewed_scoring_event_sha256:"a".repeat(64)},
      {...original,evidence:[originalFed,{...originalEcb,
        originating_reporting_organization_id:"federal_reserve"}]},
      {...original,evidence:[originalFed,{...originalEcb,syndicated_from:originalFed.url}]},
      {...original,evidence:[originalFed,{...originalEcb,source_registry_id:"federal_reserve"}]},
      {...original,evidence:[originalFed,{...originalEcb,original_article_sha256:fedHash}]},
    ]){
      const {scoring,scorerDeps}=inputs(event,changed);
      await expect(scoreAndSignQualifiedOnDemandCountry(scoring,scorerDeps))
        .rejects.toThrow("ON_DEMAND_QUALIFICATION_NOT_VERIFIED");
    }
  });
  it("retains no generic headline pairing, no stored raw payload, no Supabase and no payment",()=>{
    const src=requireSource();
    expect(src).toContain("qualifyIndependentSameEvent");
    expect(src).toContain("readB2CommercialSourceRights");
    for(const forbidden of ["requireRiskSupabase","settleCoinbaseX402",
      "persistRiskObject","fetch(","PAYMENT-SIGNATURE"]){
      expect(src).not.toContain(forbidden);
    }
  });
});
import { readFileSync } from "node:fs";
function requireSource(){
  return readFileSync("src/lib/on-demand-reviewed-rights-qualifier.server.ts","utf8");
}
