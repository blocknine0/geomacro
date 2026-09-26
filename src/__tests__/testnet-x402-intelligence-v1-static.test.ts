import fs from "node:fs";
import { describe, expect, it } from "vitest";

const planner = fs.readFileSync("src/lib/agent-query-plan.ts", "utf8");
const responseAssembler = fs.readFileSync("src/lib/agent-query-response.server.ts", "utf8");
const paidRoute = fs.readFileSync("src/routes/api.x402.intelligence.ts", "utf8");
const manifest = JSON.parse(fs.readFileSync("docs/testnet/geomacro-agent-manifest.json", "utf8"));
const openapi = JSON.parse(fs.readFileSync("docs/testnet/openapi-testnet-v1.json", "utf8"));

describe("Geomacro x402 Testnet Intelligence v1", () => {
  it("advertises exactly the three initial structured-intelligence domains", () => {
    expect(manifest.status).toBe("testnet");
    expect(manifest.raw_data_delivery).toBe(false);
    expect(manifest.domains).toEqual([
      "geopolitics",
      "macroeconomics",
      "critical_minerals",
    ]);
    expect(manifest.delivery_contract.format).toBe("structured-derived-intelligence-only");
    expect(manifest.delivery_contract.execution_authorized).toBe(false);
  });

  it("keeps required domain topics in the deterministic agent query planner", () => {
    for (const topic of [
      "conflict_geopolitics",
      "sanctions_restrictions",
      "macro_risk",
      "fx_external_risk",
      "critical_minerals",
    ]) {
      expect(planner).toContain(`"${topic}"`);
    }
  });

  it("requires no-charge deliverability validation before x402 payment", () => {
    expect(paidRoute).toContain("checkAgentQueryDeliverability");
    expect(paidRoute).toContain("payment_required_now: false");
    expect(paidRoute).toContain("Requested intelligence is not currently fully deliverable; no payment is accepted.");
    expect(paidRoute).toContain("PAYMENT-REQUIRED");
    expect(paidRoute).toContain("x402Version: 2");
  });

  it("publishes only structured-derived live-event intelligence", () => {
    expect(responseAssembler).toContain('current_event_delivery: includeHotTopics ? "structured-derived-intelligence-only" : null');
    expect(responseAssembler).toContain("current_event_raw_source_material_redistributed: false");
    expect(responseAssembler).toContain("execution_authorized: false");

    const forbiddenPublicPayloadKeys = [
      "raw_payload",
      "raw_data",
      "raw_body",
      "article_body",
      "article_text",
      "provider_payload",
      "source_payload",
      "scraped_html",
      "html_body",
      "internal_prompt",
      "system_prompt",
      "provider_api_key",
      "service_role_key",
      "seed_phrase",
    ];

    for (const key of forbiddenPublicPayloadKeys) {
      expect(responseAssembler).not.toContain(`${key}:`);
      expect(responseAssembler).not.toContain(`"${key}"`);
    }
  });

  it("stages a machine-readable x402 testnet contract without changing the locked website", () => {
    expect(openapi.openapi).toBe("3.1.0");
    expect(openapi["x-geomacro"].environment).toBe("testnet");
    expect(openapi["x-geomacro"].raw_data_delivery).toBe(false);
    expect(openapi["x-geomacro"].delivery_format).toBe("structured-derived-intelligence-only");
    expect(openapi["x-geomacro"].execution_authorized).toBe(false);

    const operation = openapi.paths["/api/x402/intelligence"].post;
    expect(operation.responses["402"].headers["PAYMENT-REQUIRED"].required).toBe(true);
    expect(
      openapi.components.schemas.StructuredIntelligenceResponse.properties.execution_authorized.const,
    ).toBe(false);
  });
});
