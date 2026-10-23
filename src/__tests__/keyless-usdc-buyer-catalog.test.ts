import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {GEOMACRO_CAPABILITY_PRICES,GEOMACRO_CAPABILITY_PRICING_VERSION,resolveGeomacroCapabilityPrice} from "../lib/capability-pricing-catalog";
const read=(file:string)=>JSON.parse(readFileSync(file,"utf8"));
describe("keyless USDC buyer discovery is founder-priced and not prematurely payable",()=>{
 const manifest=read("public/.well-known/geomacro-buyer.json");
 const discovery=read("public/.well-known/x402.json");
 const alias=read("public/.well-known/x402");
 const commerce=read("public/.well-known/geomacro-commerce.json");
 it("publishes every and only canonical price/variant with exact atomic USDC, including gated pilot",()=>{
  const expected=Object.entries(GEOMACRO_CAPABILITY_PRICES)
   .flatMap(([capability,variants])=>Object.keys(variants).map(variant=>
    resolveGeomacroCapabilityPrice(capability,variant)));
  expect(manifest.canonical_pricing_version).toBe(GEOMACRO_CAPABILITY_PRICING_VERSION);
  expect(manifest.pricing).toHaveLength(expected.length);
  expect(new Set(manifest.pricing.map((x:{capability:string;variant:string})=>x.capability+":"+x.variant)).size).toBe(expected.length);
  for(const item of expected){
   const entry=manifest.pricing.find((x:{capability:string;variant:string})=>
    x.capability===item.capability&&x.variant===item.variant);
   expect(entry).toBeDefined();
   expect(entry.amount_usdc).toBe(item.amount_usdc);
   expect(entry.amount_atomic).toBe(item.amount_atomic);
   expect(entry.availability).toBe("CHECK_LIVE_PROOF_BEFORE_PAYMENT");
   expect(entry.pilot).toBe(["signed_risk_object","risk_gate_bundle"].includes(item.capability));
  }
 });
 it("publishes no payable production x402 route, network receiver or fake signed commercial proof",()=>{
  expect(manifest.release_status).toBe("controlled_prelaunch");
  expect(manifest.payable_now).toBe(false);
  expect(manifest.endpoints.paid_candidate.enabled).toBe(false);
  expect(manifest.x402.transaction_executed_by_catalog).toBe(false);
  expect(manifest.x402.live_challenge_overrides_static_catalog).toBe(true);
  expect(manifest.guardrails.never_charge_errors).toBe(true);
  expect(manifest.guardrails.prevent_duplicate_settlement).toBe(true);
  expect(manifest.guardrails.company_revenue_verified).toBe(false);
  expect(discovery.status).toBe("prelaunch");
  expect(discovery.productionFundsAuthorized).toBe(false);
  expect(discovery.resources).toEqual([]);
  expect(alias).toEqual(discovery);
  expect(commerce.service.execution_authorized).toBe(false);
  expect(manifest.endpoints.free_preflight.method).toBe("POST");
  expect(manifest.endpoints.paid_candidate.method).toBe("POST");
  expect(JSON.stringify(manifest)).not.toMatch(/BEGIN PRIVATE KEY|PAYMENT-SIGNATURE:|0x[a-f0-9]{40}/);
 });
 it("is discoverable to buyers and small user-facing store while API keys remain coming soon",()=>{
  const url="https://geomacro.live/.well-known/geomacro-buyer.json";
  expect(discovery.discovery.buyer_quickstart).toBe(url);
  expect(alias.discovery.buyer_quickstart).toBe(url);
  expect(commerce.discovery.buyer_quickstart).toBe(url);
  const component=readFileSync("src/components/keyless-buyer-quickstart.tsx","utf8");
  expect(component).toContain("Controlled prelaunch");
  expect(component).toContain("/.well-known/geomacro-buyer.json");
  expect(component).not.toContain("Live now");
  for(const page of ["src/routes/pricing.tsx","src/routes/data-api.tsx"])
   expect(readFileSync(page,"utf8")).toContain("<KeylessBuyerQuickstart />");
  expect(readFileSync("src/components/api-keys-notice.tsx","utf8")).toContain("Coming soon");
 });
});
