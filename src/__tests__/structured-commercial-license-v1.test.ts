import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {
  GEOMACRO_STRUCTURED_LICENSE_ID,
  GEOMACRO_STRUCTURED_LICENSE_PATH,
  GEOMACRO_STRUCTURED_LICENSE_MACHINE_PATH,
  GEOMACRO_STRUCTURED_LICENSE_TERMS,
  GEOMACRO_STRUCTURED_LICENSE_DISCOVERY,
  GEOMACRO_STRUCTURED_LICENSE_HEADERS,
} from "../lib/geomacro-structured-commercial-license";

const file=(path:string)=>readFileSync(path,"utf8");
const publicRoute=file("src/routes/api.intelligence.capabilities.ts");
const paid=file("src/lib/mainnet-intelligence-endpoint.server.ts");
const agent=file("src/lib/official-geomacro-agent.server.ts");
const x402=file("src/lib/x402-discovery.server.ts");
const paidPrivacy=file("src/lib/public-paid-output-boundary.ts");
const owner=file("docs/COMMERCIAL_DERIVED_OUTPUT_OWNER_LICENSE.md");
const policy=file("docs/GEOMACRO_INTELLIGENCE_CONTRACT_V1.md");

describe("Geomacro structured-only commercial customer license v1",()=>{
  it("publishes human- and machine-readable customer terms via unlocked backend API",()=>{
    expect(GEOMACRO_STRUCTURED_LICENSE_TERMS.schema).toBe(GEOMACRO_STRUCTURED_LICENSE_ID);
    expect(GEOMACRO_STRUCTURED_LICENSE_TERMS.id).toBe(GEOMACRO_STRUCTURED_LICENSE_ID);
    expect(GEOMACRO_STRUCTURED_LICENSE_TERMS.version).toBe(GEOMACRO_STRUCTURED_LICENSE_DISCOVERY.version);
    expect(GEOMACRO_STRUCTURED_LICENSE_DISCOVERY.human_readable).toBe(GEOMACRO_STRUCTURED_LICENSE_PATH);
    expect(GEOMACRO_STRUCTURED_LICENSE_DISCOVERY.machine_readable).toBe(GEOMACRO_STRUCTURED_LICENSE_MACHINE_PATH);
    expect(publicRoute).toContain('view==="license"');
    expect(publicRoute).toContain("return Response.json(GEOMACRO_STRUCTURED_LICENSE_TERMS");
    expect(publicRoute).toContain("commercial_license:GEOMACRO_STRUCTURED_LICENSE_DISCOVERY");
    expect(policy).toContain("/api/intelligence/capabilities?view=license");
    expect(owner).toContain("Owner-Controlled Commercial License");
  });
  it("licenses only original owned derived outputs; never raw upstream rights",()=>{
    const t=GEOMACRO_STRUCTURED_LICENSE_TERMS;
    expect(t.grant.nature).toContain("nonexclusive");
    expect(t.grant.conditions).toContain("Valid authenticated or expressly contracted entitlement");
    expect(t.raw_data_delivery).toBe("NEVER_RAW_UPSTREAM_SOURCE_MATERIAL");
    expect(t.legal_boundaries.ownership_of_uncopyrightable_facts_claimed).toBe(false);
    expect(t.legal_boundaries.upstream_publisher_permission_self_granted).toBe(false);
    expect(t.legal_boundaries.raw_upstream_delivery_authorized).toBe(false);
    expect(t.legal_boundaries.raw_upstream_redistribution_authorized).toBe(false);
    expect(t.legal_boundaries.third_party_rights_transferred).toBe(false);
    expect(t.legal_boundaries.source_specific_attribution_waived).toBe(false);
    expect(t.legal_boundaries.requires_lawful_source_use).toBe(true);
    expect(t.legal_boundaries.required_source_eligibility_remains_fail_closed).toBe(true);
    expect(t.legal_boundaries.independent_evidence_or_scoring_certified).toBe(false);
    expect(t.legal_boundaries.current_gri_or_risk_indices_certified).toBe(false);
    expect(t.legal_boundaries.payment_or_settlement_authorized).toBe(false);
    expect(t.legal_boundaries.customer_acceptance_established_by_discovery).toBe(false);
    expect(t.legal_boundaries.live_product_availability_established_by_discovery).toBe(false);
    expect(GEOMACRO_STRUCTURED_LICENSE_DISCOVERY.raw_source_material_delivered).toBe(false);
    expect(GEOMACRO_STRUCTURED_LICENSE_DISCOVERY.source_eligibility_still_required).toBe(true);
    expect(t.grant.exclusions.join(" ")).toMatch(/raw publisher text/i);
  });
  it("references the same version from capability, official AI agent and marketplace discovery",()=>{
    expect(publicRoute).toContain("commercial_license:GEOMACRO_STRUCTURED_LICENSE_DISCOVERY");
    expect(agent).toContain("commercial_license:GEOMACRO_STRUCTURED_LICENSE_DISCOVERY");
    expect(x402).toContain("commercialLicense:GEOMACRO_STRUCTURED_LICENSE_DISCOVERY");
    expect(publicRoute).toContain("raw_article_material_exposed: false");
    expect(agent).toContain("raw_data_delivered:false");
  });
  it("discloses customer terms only on 402 offer and proven paid 200 delivery/replay",()=>{
    expect(GEOMACRO_STRUCTURED_LICENSE_HEADERS["X-Geomacro-Output-License"])
      .toBe(GEOMACRO_STRUCTURED_LICENSE_ID);
    expect(GEOMACRO_STRUCTURED_LICENSE_HEADERS.Link)
      .toContain(GEOMACRO_STRUCTURED_LICENSE_PATH);
    expect(GEOMACRO_STRUCTURED_LICENSE_HEADERS["X-Geomacro-Raw-Data-Delivered"])
      .toBe("false");
    expect(paid).toContain("structured_output_license_id:GEOMACRO_STRUCTURED_LICENSE_DISCOVERY.id");
    expect(paid).toContain("license_disclosure_is_not_payment_authorization:true");
    expect((paid.match(/\.\.\.GEOMACRO_STRUCTURED_LICENSE_HEADERS/gu)??[])).toHaveLength(3);
    expect(paid).toContain("PAYMENT-REQUIRED");
    expect(paid).toContain("PAYMENT-RESPONSE");
    expect(paid).toContain("assertGeomacroIntelligenceResponseContract(safeIntelligence)");
    expect(paid).toContain("assertPublicPaidOutputBoundary(response)");
  });
  it("preserves current paid raw/article/provider data leak defenses",()=>{
    expect(paidPrivacy).toContain("PAID_OUTPUT_EMBEDDED_SOURCE_URL_UNQUALIFIED");
    expect(paidPrivacy).toContain("PAID_OUTPUT_INTERNAL_SOURCE_FIELD");
    expect(GEOMACRO_STRUCTURED_LICENSE_TERMS.grant.exclusions.join(" ")).toMatch(/feeds/i);
    expect(policy).toContain("independent");
  });
});
