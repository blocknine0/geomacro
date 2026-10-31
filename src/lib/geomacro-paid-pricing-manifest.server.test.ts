import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {
  publicGeomacroPaidPricingManifest,GEOMACRO_PAID_PRICING_PATH,
} from "./geomacro-paid-pricing-manifest.server";
import {
  GEOMACRO_CAPABILITY_PRICES,GEOMACRO_CAPABILITY_PRICING_VERSION,
  resolveGeomacroCapabilityPrice,
} from "./capability-pricing-catalog";
import {GEOMACRO_USDC_NETWORKS} from "./geomacro-multichain-usdc.server";

const LOCKED=[
  ["gri_read","verified_cached","0.005","5000"],
  ["gri_read","verified_change_attribution","0.01","10000"],
  ["structural_country_digest","standard","0.02","20000"],
  ["structural_corridor_digest","standard","0.03","30000"],
  ["structural_country_profile","standard","0.03","30000"],
  ["structural_corridor_profile","standard","0.05","50000"],
  ["intelligence_query","focused","0.02","20000"],
  ["intelligence_query","standard","0.03","30000"],
  ["intelligence_query","complex_multi_source","0.05","50000"],
  ["signed_risk_object","existing_valid_signed","0.03","30000"],
  ["signed_risk_object","newly_qualified_signed","0.05","50000"],
  ["risk_gate_bundle","existing_proof_preflight","0.03","30000"],
  ["risk_gate_bundle","standard","0.05","50000"],
  ["risk_gate_bundle","complex_multi_source","0.05","50000"],
] as const;

describe("exact founder prices in one API + AI Agent on Base/Arc/Polygon (NO FUNDS)",()=>{
  it("exposes EXACT 8 capabilities and 14 founder approved variants, no invented tiers",()=>{
    const manifest=publicGeomacroPaidPricingManifest();
    expect(GEOMACRO_PAID_PRICING_PATH).toBe("/api/v1/pricing");
    expect(manifest.pricing_version).toBe(GEOMACRO_CAPABILITY_PRICING_VERSION);
    expect(manifest.capability_count).toBe(7);
    expect(manifest.price_variant_count).toBe(12);
    expect(manifest.capabilities.filter(p=>p.launch_status==="COMING_SOON")).toHaveLength(1);
    expect(manifest.capabilities.filter(p=>p.new_sales_allowed)).toHaveLength(6);
    expect(Object.keys(GEOMACRO_CAPABILITY_PRICES).length).toBe(8);
    const table=manifest.capabilities.flatMap(c=>c.variants.map(v=>
      [c.capability,v.variant,v.price_usdc,v.amount_atomic]));
    expect(table).toEqual(LOCKED.filter(row=>row[0]!=="gri_read"));
    expect(manifest.capabilities.some(c=>c.capability==="gri_read")).toBe(false);
    for(const [c,v,price,atomic] of LOCKED){
      expect(resolveGeomacroCapabilityPrice(c,v)).toMatchObject({
        amount_usdc:price,amount_atomic:atomic,currency:"USDC",
      });
    }
  });
  it("shows the SAME 6-decimal price on 3 native USDC rails without payments",()=>{
    const x=publicGeomacroPaidPricingManifest();
    expect(x.networks.map(v=>v.id)).toEqual(["base","arc","polygon"]);
    expect(x.networks.every(v=>v.merchant_settlement_verified===false)).toBe(true);
    expect(x.networks.map(v=>v.caip2)).toEqual([
      "eip155:8453","eip155:5042","eip155:137",
    ]);
    let checks=0;
    for(const capability of x.capabilities){
      for(const variant of capability.variants){
        const approved=resolveGeomacroCapabilityPrice(capability.capability,variant.variant);
        expect(variant.nonpayable_network_previews).toHaveLength(3);
        for(const network of variant.nonpayable_network_previews){
          const approvedChain=GEOMACRO_USDC_NETWORKS[network.network];
          expect(network.caip2).toBe(approvedChain.caip2);
          expect(network.native_usdc_asset).toBe(approvedChain.asset);
          expect(network.amount_atomic).toBe(approved.amount_atomic);
          expect(network.payable_offer_issued).toBe(false);
          expect(network.merchant_settlement_verified).toBe(false);
          checks++;
        }
      }
    }
    expect(checks).toBe(36);
    expect(x.payment_authorized).toBe(false);
    expect(x.x402_payment_requirement_issued).toBe(false);
    expect(x.raw_upstream_data_delivered).toBe(false);
    expect(x.no_automatic_price_upgrades).toBe(true);
    expect(x.no_extra_signed_object_fee_with_risk_gate_bundle).toBe(true);
    expect(x.commercial_license.upstream_source_rights_granted).toBe(false);
  });
  it("lists public pricing on official agent/OpenAPI and customer capabilities",()=>{
    const agent=readFileSync("src/lib/official-geomacro-agent.server.ts","utf8");
    const route=readFileSync("src/routes/api.v1.pricing.ts","utf8");
    const discover=readFileSync("src/routes/api.intelligence.capabilities.ts","utf8");
    expect(agent).toContain("locked_usdc_pricing:GEOMACRO_PAID_PRICING_PATH");
    expect(agent).toContain("[GEOMACRO_PAID_PRICING_PATH]:{get:{");
    expect(discover).toContain('paid_price_catalog: "GET "+GEOMACRO_PAID_PRICING_PATH');
    expect(route).toContain('createFileRoute("/api/v1/pricing")');
    expect(route).toContain("publicGeomacroPaidPricingManifest()");
    expect(route).not.toContain("settleCoinbaseX402");
    expect(route).not.toContain("PAYMENT-REQUIRED");
  });
  it("never offers obsolete flat legacy production price for x402 risk",()=>{
    const risk=readFileSync("src/routes/api.x402.risk.ts","utf8");
    expect(risk).toContain('price_usdc: config.environment === "production" ? null : config.priceUsdc');
    expect(risk).toContain('pricing_catalog: "/api/v1/pricing"');
    expect(risk).toContain('"LEGACY_X402_PRODUCTION_DISABLED"');
  });
});
