import { describe, expect, it } from "vitest";
import { computeGeomacroIntelligenceProductHash } from "../lib/geomacro-intelligence-contract";
import {
  assertPublicPaidOutputBoundary,
  sanitizeAndRehashPaidPreparedResponse,
  sanitizePublicPaidOutput,
} from "../lib/public-paid-output-boundary";

describe("source-free paid output boundary", () => {
  it("removes internal source and rights metadata while preserving payment provider metadata", () => {
    const sanitized = sanitizePublicPaidOutput({
      structural: {
        macro: {
          source_id: "world_bank_indicators",
          source_contract: { licence_name: "CC BY 4.0" },
          source_observed_at: "2026-10-02T00:00:00.000Z",
          delivery: "GOVERNED_WORLD_BANK_MODULE_STATE",
          methodology_version: "world-bank-derived-v1",
          limitations: { scope: "World Bank governed source" },
          state: { score: 61 },
        },
      },
      payment: { provider: "coinbase_cdp_x402" },
    });

    expect(sanitized).toEqual({
      structural: {
        macro: {
          delivery: "GOVERNED_DERIVED_MODULE_STATE",
          methodology_version: "geomacro-governed-derived-v1",
          limitations: { scope: "governed derived intelligence" },
          state: { score: 61 },
        },
      },
      payment: { provider: "coinbase_cdp_x402" },
    });
    expect(() => assertPublicPaidOutputBoundary(sanitized)).not.toThrow();
  });

  it("fails closed if unsanitized source identity reaches the final boundary", () => {
    expect(() => assertPublicPaidOutputBoundary({ source_id: "hidden" })).toThrow(
      /PAID_OUTPUT_INTERNAL_SOURCE_FIELD/,
    );
    expect(() => assertPublicPaidOutputBoundary({ note: "USGS input" })).toThrow(
      /PAID_OUTPUT_PROVIDER_IDENTITY_LEAK/,
    );
  });

  it("blocks real publisher links hidden inside otherwise approved derived fields", () => {
    const leak={
      answer: { summary:"Geomacro finds escalation. Original: https://news.un.org/en/story/2026/10/12345" },
      limitations:["Review raw article at www.usgs.gov/news/mineral-supply"],
    };
    expect(() => assertPublicPaidOutputBoundary(leak)).toThrow(
      /PAID_OUTPUT_EMBEDDED_SOURCE_URL/,
    );
    expect(() => sanitizePublicPaidOutput(leak, {rejectEmbeddedLinks:true})).toThrow(
      /PAID_OUTPUT_EMBEDDED_SOURCE_URL_UNQUALIFIED/,
    );
    const scrubbed=sanitizePublicPaidOutput(leak);
    expect(scrubbed).toEqual({
      answer:{summary:"governed derived intelligence"},
      limitations:["governed derived intelligence"],
    });
    expect(() => assertPublicPaidOutputBoundary(scrubbed)).not.toThrow();
    expect(JSON.stringify(scrubbed)).not.toContain("news.un.org");
    expect(JSON.stringify(scrubbed)).not.toContain("usgs.gov");
  });

  it("refuses to prepare a NEW chargeable response with embedded third-party URLs, but scrubs old replay", () => {
    const prepared={
      schema_version:"geomacro.adaptive-intelligence-response.v1",
      product:"geomacro_adaptive_risk_intelligence_v1",
      request_id:"request-123",
      answer:{summary:"Source https://www.federalreserve.gov/newsevents/pressreleases/monetary.htm"},
      delivered_product_hash:"0".repeat(64),
      availability:{deliverable:true},
      payment:{provider:"coinbase_cdp_x402"},
    };
    expect(()=>sanitizeAndRehashPaidPreparedResponse(prepared,{rejectEmbeddedLinks:true}))
      .toThrow("PAID_OUTPUT_EMBEDDED_SOURCE_URL_UNQUALIFIED");
    const replay=sanitizeAndRehashPaidPreparedResponse(prepared);
    expect(replay.answer).toEqual({summary:"governed derived intelligence"});
    expect(JSON.stringify(replay)).not.toContain("federalreserve.gov");
    expect(()=>assertPublicPaidOutputBoundary(replay)).not.toThrow();
  });

  it("re-hashes legacy prepared responses after sanitation", () => {
    const sanitized = sanitizeAndRehashPaidPreparedResponse({
      schema_version: "geomacro.adaptive-intelligence-response.v1",
      product: "geomacro_adaptive_risk_intelligence_v1",
      request_id: "request-123",
      structural: { source_id: "usgs_mcs", value: 7 },
      delivered_product_hash: "0".repeat(64),
      availability: { source_contracts: [{ source_id: "usgs_mcs" }], deliverable: true },
      payment: { provider: "coinbase_cdp_x402" },
    });

    const {
      delivered_product_hash: deliveredProductHash,
      availability,
      payment,
      ...coreWithoutProductHash
    } = sanitized;
    expect(deliveredProductHash).toBe(
      computeGeomacroIntelligenceProductHash(coreWithoutProductHash),
    );
    expect(availability).toEqual({ deliverable: true });
    expect(payment).toEqual({ provider: "coinbase_cdp_x402" });
    expect(JSON.stringify(sanitized)).not.toContain("usgs_mcs");
  });

  it("wires sanitation before durable x402 preparation and on replay", async () => {
    const fs = await import("node:fs/promises");
    const route = await fs.readFile("src/lib/mainnet-intelligence-endpoint.server.ts", "utf8");
    expect(route).toContain("sanitizeAndRehashPaidPreparedResponse(\n            assembled");
    expect(route).toContain("{ rejectEmbeddedLinks: true }");
    expect(route).toContain("availability: publicAgentQueryAvailability(finalAvailability)");
    expect(route).not.toContain("availability: finalAvailability,");
    expect(route).toContain("assertPublicPaidOutputBoundary(prepared)");
    expect(route).toContain("const safePrepared = sanitizeAndRehashPaidPreparedResponse(prepared)");
  });
});
