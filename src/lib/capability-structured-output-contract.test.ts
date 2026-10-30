import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {
  GEOMACRO_CAPABILITY_PRICES,
  resolveGeomacroCapabilityPrice,
} from "./capability-pricing-catalog";
import {
  GEOMACRO_STRUCTURED_OUTPUT_CONTRACT_VERSION,
  GEOMACRO_VARIANT_STRUCTURED_OUTPUTS,
  geomacroPricedStructuredOutput,
  geomacroStructuredOutputCatalog,
} from "./capability-structured-output-contract";
import {publicGeomacroPaidPricingManifest} from "./geomacro-paid-pricing-manifest.server";

const LOCKED=[
  ["gri_read","verified_cached","0.005"],
  ["gri_read","verified_change_attribution","0.01"],
  ["structural_country_digest","standard","0.02"],
  ["structural_corridor_digest","standard","0.03"],
  ["structural_country_profile","standard","0.03"],
  ["structural_corridor_profile","standard","0.05"],
  ["intelligence_query","focused","0.02"],
  ["intelligence_query","standard","0.03"],
  ["intelligence_query","complex_multi_source","0.05"],
  ["signed_risk_object","existing_valid_signed","0.03"],
  ["signed_risk_object","newly_qualified_signed","0.05"],
  ["risk_gate_bundle","existing_proof_preflight","0.03"],
  ["risk_gate_bundle","standard","0.05"],
  ["risk_gate_bundle","complex_multi_source","0.05"],
] as const;

describe("founder-locked USD prices: precise output fields per product",()=>{
  it("has exactly 8 capabilities, 14 approved variants and no unexplained price drift",()=>{
    expect(Object.keys(GEOMACRO_VARIANT_STRUCTURED_OUTPUTS).sort()).toEqual(
      Object.keys(GEOMACRO_CAPABILITY_PRICES).sort());
    const outputs=geomacroStructuredOutputCatalog();
    expect(outputs).toHaveLength(14);
    expect(outputs.map(x=>[x.capability,x.variant,x.amount_usdc])).toEqual(LOCKED);
    for(const [capability,variant,price] of LOCKED){
      const result=geomacroPricedStructuredOutput(capability,variant);
      expect(result.schema).toBe(GEOMACRO_STRUCTURED_OUTPUT_CONTRACT_VERSION);
      expect(result.amount_usdc).toBe(price);
      expect(result.amount_usdc).toBe(resolveGeomacroCapabilityPrice(capability,variant).amount_usdc);
      expect(result.customer_receives.length).toBeGreaterThanOrEqual(3);
      expect(new Set(result.customer_receives).size).toBe(result.customer_receives.length);
      expect(result.description.length).toBeGreaterThan(30);
      expect(result.common_preconditions).toContain("LAWFUL_SOURCE_USE_AND_ORIGINAL_FRESHNESS_VERIFIED");
      expect(result.common_preconditions).toContain("ALL_REQUIRED_MODULES_PREPARED_AND_HASH_BOUND");
      expect(result.charge_authorized_by_catalog).toBe(false);
      expect(result.customer_delivery_status).toBe("CONTRACT_ONLY_REQUIRES_LIVE_PROOF");
      expect(result.raw_source_payload).toBe(false);
      expect(result.upstream_article_text).toBe(false);
      expect(result.source_publisher_urls).toBe(false);
      expect(result.execution_authorized).toBe(false);
      expect(result.license_id).toBe("geomacro.structured-intelligence-commercial-license.v1");
      const fields=[...result.customer_receives,...result.only_when_verified];
      for(const f of fields){
        expect(f).toMatch(/^[a-z_][a-z0-9_]*(?:\[\*\])?(?:\.[a-z_][a-z0-9_]*(?:\[\*\])?)*$/u);
        expect(f).not.toMatch(/(?:source_id|source_url|publisher|provider|raw_data|raw_text|article|b2_key)/iu);
      }
      expect(result.extra_preconditions.length).toBeGreaterThan(0);
    }
    expect(()=>geomacroPricedStructuredOutput("intelligence_query","premium")).toThrow();
    expect(()=>geomacroPricedStructuredOutput("any","standard")).toThrow();
  });
  it("distinguishes GRI change attribution from cached state only",()=>{
    const cached=geomacroPricedStructuredOutput("gri_read","verified_cached");
    const change=geomacroPricedStructuredOutput("gri_read","verified_change_attribution");
    expect(cached.customer_receives).toContain("gri_context.score");
    expect(cached.customer_receives).not.toContain("change_intelligence[*].change");
    expect(change.customer_receives).toContain("gri_context.change_attribution");
    expect(change.customer_receives).toContain("gri_context.previous_score");
    expect(change.only_when_verified).toContain("change_intelligence[*].drivers");
    expect(change.extra_preconditions).toContain("SIGNED_PREVIOUS_STATE_AND_CHANGE_ATTRIBUTION_PROVEN");
  });
  it("never promises risk scoring/signatures for a structural digest",()=>{
    for(const id of ["structural_country_digest","structural_corridor_digest"]){
      const d=geomacroPricedStructuredOutput(id,"standard");
      expect(d.response_kind).toBe("adaptive_intelligence");
      expect(d.customer_receives).toContain("structural[*].intelligence");
      expect(d.customer_receives).not.toContain("signed_risk_objects[*].object.risk");
      expect(d.customer_receives).not.toContain("risk_gate[*].result");
    }
    expect(geomacroPricedStructuredOutput("structural_corridor_profile","standard").subject_scope)
      .toBe("directional_corridor");
  });
  it("includes GRO exactly once inside every risk-gate bundle",()=>{
    for(const variant of ["existing_proof_preflight","standard","complex_multi_source"]){
      const result=geomacroPricedStructuredOutput("risk_gate_bundle",variant);
      expect(result.included_signed_gro_fee).toBe("INCLUDED_NO_DOUBLE_CHARGE");
      expect(result.customer_receives).toContain("risk_gate[*].result");
      expect(result.customer_receives).toContain("signed_risk_objects[*].object.integrity");
      expect(result.execution_authorized).toBe(false);
    }
    const signed=geomacroPricedStructuredOutput("signed_risk_object","existing_valid_signed");
    expect(signed.customer_receives).toContain("signed_risk_objects[*].object.risk_object_id");
    expect(signed.customer_receives).toContain("signed_risk_objects[*].object.integrity");
    expect(signed.customer_receives).toContain("signed_risk_objects[*].object.expires_at");
  });
  it("discovery offers one exact structured output contract per USDC variant across 3 chains",()=>{
    const pricing=publicGeomacroPaidPricingManifest();
    expect(pricing.structured_output_contract_version).toBe(GEOMACRO_STRUCTURED_OUTPUT_CONTRACT_VERSION);
    expect(pricing.all_prices_map_to_structured_output_contracts).toBe(true);
    expect(pricing.capability_count).toBe(7);
    expect(pricing.price_variant_count).toBe(12);
    for(const capability of pricing.capabilities){
      for(const variant of capability.variants){
        expect(variant.structured_delivery.capability).toBe(capability.capability);
        expect(variant.structured_delivery.variant).toBe(variant.variant);
        expect(variant.structured_delivery.amount_usdc).toBe(variant.price_usdc);
        expect(variant.structured_delivery.raw_source_payload).toBe(false);
        expect(variant.nonpayable_network_previews).toHaveLength(3);
        expect(variant.nonpayable_network_previews.every(x=>x.payable_offer_issued===false)).toBe(true);
      }
    }
    expect(pricing.x402_payment_requirement_issued).toBe(false);
  });
  it("official agent, capabilities and JSON price routes publish one discoverable specification",()=>{
    const agent=readFileSync("src/lib/official-geomacro-agent.server.ts","utf8");
    const discover=readFileSync("src/routes/api.intelligence.capabilities.ts","utf8");
    const route=readFileSync("src/routes/api.v1.pricing.ts","utf8");
    expect(agent).toContain("per_variant_output_fields_endpoint:endpoints.priced_output_fields");
    expect(agent).toContain('["/api/intelligence/capabilities"]');
    expect(discover).toContain('if(view==="outputs")');
    expect(discover).toContain("publicGeomacroStructuredOutputCatalog()");
    expect(discover).toContain("this_discovery_is_not_a_payment_offer:true");
    expect(route).toContain("publicGeomacroPaidPricingManifest()");
    expect(route).not.toContain("settleCoinbaseX402");
  });
});
