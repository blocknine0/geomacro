import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  "src/lib/agent-query-deliverability.server.ts",
  "utf8",
);

describe("adaptive World Bank governed fallback availability", () => {
  it("uses the same governed loader for macro, fiscal and external FX", () => {
    expect(source).toContain("loadAgentWorldBankModule");
    expect(source).toContain('module === "macro_monetary"');
    expect(source).toContain('module === "sovereign_fiscal"');
    expect(source).toContain('module === "external_fx"');
    expect(source).toContain("AGENT_WORLD_BANK_SOURCE_ID");
  });

  it("records governed fallbacks without weakening freshness or rights checks", () => {
    expect(source).toContain("governedFallbackModules.add(module)");
    expect(source).toContain('fallback?.code === "SOURCE_NOT_ELIGIBLE"');
    expect(source).toContain('fallback?.code === "OBSERVATION_STALE"');
    expect(source).toContain("ineligibleSources.add(AGENT_WORLD_BANK_SOURCE_ID)");
    expect(source).toContain("stale.add(module)");
  });

  it("fails closed when the governed fallback store is unavailable", () => {
    expect(source).toContain("A governed fallback store outage never broadens delivery");
    expect(source).toContain("fallback = null");
  });
});
