import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {GEOMACRO_CAPABILITY_PRICES,GEOMACRO_CAPABILITY_PRICING_VERSION,
 isPublicStoreCapability,
 resolveGeomacroCapabilityPrice} from "../lib/capability-pricing-catalog";
import {geomacroKeylessX402BuyerCatalog} from "../lib/keyless-x402-buyer-catalog";
const read=(file:string)=>JSON.parse(readFileSync(file,"utf8"));
describe("keyless merchant x402 buyer catalog is exact-price and no-funds",()=>{
 const catalog=geomacroKeylessX402BuyerCatalog();
 const manifest=read("public/.well-known/x402.json");
 it("exposes every exact immutable catalog price through the same canonical resolver",()=>{
  const expected=Object.entries(GEOMACRO_CAPABILITY_PRICES)
    .filter(([capability])=>isPublicStoreCapability(capability))
    .flatMap(([capability,variants])=>Object.keys(variants).map(variant=>
     resolveGeomacroCapabilityPrice(capability,variant)));
  const actual=catalog.capabilities.flatMap(row=>row.variants);
  expect(catalog.pricing_version).toBe(GEOMACRO_CAPABILITY_PRICING_VERSION);
  expect(catalog.capabilities.some(x=>x.capability==="gri_read")).toBe(false);
  expect(actual).toHaveLength(expected.length);
  expect(new Set(actual.map(x=>x.capability+":"+x.variant)).size).toBe(expected.length);
  for(const x of expected){
   const entry=actual.find(y=>y.capability===x.capability&&y.variant===x.variant);
   expect(entry?.amount_usdc).toBe(x.amount_usdc);
   expect(entry?.amount_atomic).toBe(x.amount_atomic);
   expect(catalog.capabilities.find(group=>group.capability===x.capability)?.availability).toBe("CHECK_LIVE_PROOF_BEFORE_PAYMENT");
  }
 });
 it("does not promote static prices into production checkout or revenue claims",()=>{
  expect(catalog.schema_version).toBe("geomacro.keyless-x402-buyer-catalog.v1");
  expect(catalog.advertised_payable_now).toBe(false);
  expect(catalog.x402.static_catalog_never_authorizes_settlement).toBe(true);
  expect(catalog.x402.managed_api_keys).toBe("COMING_SOON");
  expect(catalog.guardrails.no_charge_on_unavailable_or_stale).toBe(true);
  expect(catalog.guardrails.current_production_eligible_claimed).toBe(false);
  expect(catalog.guardrails.revenues_verified_by_catalog).toBe(false);
  expect(catalog.routes.no_charge_availability.method).toBe("POST");
  expect(catalog.routes.paid_candidate.method).toBe("POST");
  expect(manifest.status).toBe("prelaunch");
  expect(manifest.productionFundsAuthorized).toBe(false);
  expect(manifest.resources).toEqual([]);
 });
 it("protects published website lock and creates backend-only public endpoint",()=>{
  const route=readFileSync("src/routes/api.v1.pricing.ts","utf8");
  expect(route).toContain('createFileRoute("/api/v1/pricing")');
  expect(route).toContain("geomacroKeylessX402BuyerCatalog()");
  expect(route).toContain("url.searchParams.getAll('view').length===1");
  expect(route).toContain("url.searchParams.get('view')==='buyer'");
  expect(route).not.toContain("PAYMENT-SIGNATURE");
  const price=readFileSync("src/routes/pricing.tsx","utf8");
  const dataApi=readFileSync("src/routes/data-api.tsx","utf8");
  expect(price).not.toContain("KeylessBuyerQuickstart");
  expect(dataApi).not.toContain("KeylessBuyerQuickstart");
  expect(readFileSync("src/components/api-keys-notice.tsx","utf8")).toContain("Coming soon");
 });
});
