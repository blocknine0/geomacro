import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {
  GEOMACRO_STRUCTURED_LICENSE_ID,
  GEOMACRO_STRUCTURED_LICENSE_PATH,
  GEOMACRO_STRUCTURED_LICENSE_MACHINE_PATH,
  GEOMACRO_STRUCTURED_LICENSE_DISCOVERY,
  GEOMACRO_STRUCTURED_LICENSE_HEADERS,
} from "../lib/geomacro-structured-commercial-license";

const file=(path:string)=>readFileSync(path,"utf8");
const machine=JSON.parse(file("public/.well-known/geomacro-structured-license.json"));
const human=file("public/legal/structured-intelligence-license.html");
const paid=file("src/lib/mainnet-intelligence-endpoint.server.ts");
const capability=file("src/routes/api.intelligence.capabilities.ts");
const agent=file("src/lib/official-geomacro-agent.server.ts");
const x402=file("src/lib/x402-discovery.server.ts");
const paidPrivacy=file("src/lib/public-paid-output-boundary.ts");

describe("Geomacro structured-only customer commercial license v1",()=>{
  it("is versioned, public and the machine/human documents match the code contract",()=>{
    expect(machine.id).toBe(GEOMACRO_STRUCTURED_LICENSE_ID);
    expect(machine.version).toBe(GEOMACRO_STRUCTURED_LICENSE_DISCOVERY.version);
    expect(machine.human_readable).toBe(GEOMACRO_STRUCTURED_LICENSE_PATH);
    expect(machine.machine_readable).toBe(GEOMACRO_STRUCTURED_LICENSE_MACHINE_PATH);
    expect(human).toContain(GEOMACRO_STRUCTURED_LICENSE_ID);
    expect(human).toContain("No raw article text");
    expect(human).toContain("Geomacro cannot grant rights it does not own");
    expect(machine.grant.nature).toContain("nonexclusive");
    expect(machine.grant.conditions).toContain("valid authenticated or expressly contracted entitlement");
  });
  it("licenses only Geomacro-owned expression; cannot authorize raw delivery or third-party rights",()=>{
    expect(GEOMACRO_STRUCTURED_LICENSE_DISCOVERY.raw_source_material_delivered).toBe(false);
    expect(GEOMACRO_STRUCTURED_LICENSE_DISCOVERY.raw_upstream_redistribution_granted).toBe(false);
    expect(GEOMACRO_STRUCTURED_LICENSE_DISCOVERY.upstream_source_rights_granted).toBe(false);
    expect(GEOMACRO_STRUCTURED_LICENSE_DISCOVERY.existing_attribution_obligations_unchanged).toBe(true);
    expect(GEOMACRO_STRUCTURED_LICENSE_DISCOVERY.source_eligibility_still_required).toBe(true);
    expect(GEOMACRO_STRUCTURED_LICENSE_DISCOVERY.commercial_product_availability_proven_by_license).toBe(false);
    expect(GEOMACRO_STRUCTURED_LICENSE_DISCOVERY.customer_payment_authorized_by_license).toBe(false);
    expect(GEOMACRO_STRUCTURED_LICENSE_DISCOVERY.customer_license_acceptance_implied_by_discovery).toBe(false);
    for(const field of [
      "raw_source_material_delivered","raw_redistribution_granted",
      "third_party_rights_granted","no_automatic_product_availability",
      "no_automatic_payment_or_settlement_authorization",
      "discovery_does_not_establish_customer_acceptance",
    ])expect(machine.commercial_safety[field]).toBe(false===false && (
      field.startsWith("no_")||field.startsWith("discovery_")
        ? true : false));
    expect(machine.commercial_safety.only_structured_derived_delivery).toBe(true);
    expect(machine.commercial_safety.upstream_source_eligibility_required).toBe(true);
  });
  it("exposes the same licence in public capability, official agent and x402 discovery",()=>{
    expect(capability).toContain("commercial_license:GEOMACRO_STRUCTURED_LICENSE_DISCOVERY");
    expect(agent).toContain("commercial_license:GEOMACRO_STRUCTURED_LICENSE_DISCOVERY");
    expect(x402).toContain("commercialLicense:GEOMACRO_STRUCTURED_LICENSE_DISCOVERY");
    expect(capability).toContain("raw_article_material_exposed: false");
    expect(agent).toContain("raw_data_delivered:false");
  });
  it("discloses terms on 402 and both live and replayed 200, but not on 503",()=>{
    expect(GEOMACRO_STRUCTURED_LICENSE_HEADERS["X-Geomacro-Output-License"])
      .toBe(GEOMACRO_STRUCTURED_LICENSE_ID);
    expect(GEOMACRO_STRUCTURED_LICENSE_HEADERS.Link)
      .toContain(GEOMACRO_STRUCTURED_LICENSE_PATH);
    expect(GEOMACRO_STRUCTURED_LICENSE_HEADERS["X-Geomacro-Raw-Data-Delivered"])
      .toBe("false");
    expect(paid).toContain("structured_output_license_id:GEOMACRO_STRUCTURED_LICENSE_DISCOVERY.id");
    expect(paid).toContain("license_disclosure_is_not_payment_authorization:true");
    expect((paid.match(/\.\.\.GEOMACRO_STRUCTURED_LICENSE_HEADERS/g)??[]).toHaveLength(3);
    expect(paid).toContain("PAYMENT-REQUIRED");
    expect(paid).toContain("PAYMENT-RESPONSE");
    expect(paid).toContain("assertGeomacroIntelligenceResponseContract(safeIntelligence)");
    expect(paid).toContain("assertPublicPaidOutputBoundary(response)");
  });
  it("preserves existing paid no-raw response sanitation and avoids licensing publisher URLs",()=>{
    expect(paidPrivacy).toContain("PAID_OUTPUT_EMBEDDED_SOURCE_URL_UNQUALIFIED");
    expect(paidPrivacy).toContain("PAID_OUTPUT_INTERNAL_SOURCE_FIELD");
    expect(machine.grant.not_granted.join(" ")).toMatch(/raw upstream/i);
    expect(machine.grant.not_granted.join(" ")).toMatch(/feed/i);
    expect(human).not.toContain("No raw data from Geomacro can ever exist");
  });
});
