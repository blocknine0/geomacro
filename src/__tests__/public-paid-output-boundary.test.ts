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
    const route = await fs.readFile("src/routes/api.x402.intelligence.ts", "utf8");
    expect(route).toContain("sanitizeAndRehashPaidPreparedResponse(assembled");
    expect(route).toContain("availability: publicAgentQueryAvailability(finalAvailability)");
    expect(route).not.toContain("availability: finalAvailability,");
    expect(route).toContain("assertPublicPaidOutputBoundary(prepared)");
    expect(route).toContain("const safePrepared = sanitizeAndRehashPaidPreparedResponse(prepared)");
  });
});
