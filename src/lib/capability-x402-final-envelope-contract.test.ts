import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const coinbase=readFileSync("src/lib/mainnet-intelligence-endpoint.server.ts","utf8");
const circle=readFileSync("src/routes/api.x402.circle_.intelligence.ts","utf8");
const replay=readFileSync("src/lib/capability-x402-replay.server.ts","utf8");
const exact=readFileSync("src/lib/capability-x402-exact-http-body.server.ts","utf8");
const worker=readFileSync("workers/commerce-ledger/src/index.mjs","utf8");

describe("authenticated final HTTP x402 envelope contract, NO FUNDS",()=>{
 it("publishes canonical payload and frozen-answer SHA independently for both rails",()=>{
  for(const text of [coinbase,circle]){
   expect(text).toContain("X-Geomacro-Delivery-SHA256");
   expect(text).toContain("X-Geomacro-Prepared-Answer-SHA256");
   expect(text).toContain("Access-Control-Expose-Headers");
   expect(text).toContain("assertFrozenCapabilityIntelligenceProjection");
   expect(text).toContain("prepared_answer_sha256");
   expect(text).toContain("freezeCanonicalCapabilityHttpBody(prior.response)");
   expect(text).toContain("sendFrozenCapabilityHttpBody(");
  }
  expect(coinbase).toContain("sendFrozenCapabilityHttpBody(frozenHttpBody,preparedResponseSha256");
  expect(circle).toContain("sendFrozenCapabilityHttpBody(frozenHttpBody,prepared.responseSha256");
  expect(exact).toContain("new Response(frozen.body");
  expect(exact).toContain("commerceSha256(frozen.body)!==frozen.sha256");
  expect(exact).toContain('"X-Geomacro-Delivery-SHA256":frozen.sha256');
 });
 it("does not regenerate final signed answer or settle before immutable delivery prepare",()=>{
  for(const text of [coinbase,circle]){
   const proof=text.lastIndexOf("assertFrozenCapabilityIntelligenceProjection");
   const prepare=Math.max(text.indexOf("await prepareCoinbaseX402Delivery"),text.indexOf("await prepareAgentCommerceDelivery"));
   const settle=Math.max(text.indexOf("await settleCoinbaseX402"),text.indexOf("await settleCircleGatewayProduction"));
   expect(proof).toBeGreaterThan(0);
   expect(prepare).toBeGreaterThan(proof);
   expect(settle).toBeGreaterThan(prepare);
   expect(text).not.toContain("real_funds_authorized: true");
  }
 });
 it("requires exact delivered-only replay match to authenticated prepared payload hash",()=>{
  expect(replay).toContain('record?.disposition!=="REPLAY"');
  expect(replay).toContain("commerceFingerprint(record.response_payload)!==record.response_sha256");
  expect(replay).toContain("responseSha256:record.response_sha256");
  expect(worker).toContain('record.state!=="delivered"');
  expect(worker).toContain('response_sha256:record.responseSha256');
  expect(worker).toContain('record.state !== "prepared"');
 });
});
