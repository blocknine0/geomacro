import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

describe("no-charge v1 integration preserves canonical x402 safety",()=>{
 it("adds a zero-price receipt only at the pre-payment 422 blocker",()=>{
  const route=readFileSync("src/lib/mainnet-intelligence-endpoint.server.ts","utf8");
  expect(route).toContain('import {makeGeomacroNoChargeResponse} from "./geomacro-nocharge"');
  const start=route.indexOf('if (!availability.deliverable) {');
  const payment=route.indexOf('if (!paymentHeader) {',start);
  expect(start).toBeGreaterThan(0);
  expect(payment).toBeGreaterThan(start);
  const negative=route.slice(start,payment);
  expect(negative).toContain("makeGeomacroNoChargeResponse({");
  expect(negative).toContain("payment_attempted:false,delivery_committed:false");
  expect(negative).toContain("no_charge, availability: publicAgentQueryAvailability(availability)");
  expect(negative).toContain("execution_authorized: false }, 422)");
  expect(negative).not.toContain("settleCoinbaseX402(");
 });
 it("never duplicates pricing or changes the immutable production price schedule",()=>{
  const route=readFileSync("src/lib/mainnet-intelligence-endpoint.server.ts","utf8");
  const catalog=readFileSync("src/lib/capability-pricing-catalog.ts","utf8");
  expect(route).toContain("resolveEligibleCoinbaseCapabilityConfig");
  expect(catalog).toContain('structural_country_digest:{standard:"0.02"}');
  expect(catalog).toContain('structural_corridor_digest:{standard:"0.03"}');
  expect(catalog).toContain('structural_country_profile:{standard:"0.03"}');
  expect(catalog).toContain('structural_corridor_profile:{standard:"0.05"}');
  expect(catalog).toContain('focused:"0.02",standard:"0.03",complex_multi_source:"0.05"');
 });
});
