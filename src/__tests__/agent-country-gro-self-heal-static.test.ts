import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/lib/agent-query-external-modules.server.ts", "utf8");

describe("adaptive country GRO self-heal", () => {
  it("remains cache-first and publishes only a missing or expired current country GRO", () => {
    expect(source).toContain('from "./country-gro-resolver.server"');
    const cacheRead = source.indexOf("resolveCountryGroAtOrBefore");
    const cachedReturn = source.indexOf("if (cached) return cached");
    const publish = source.indexOf("publishCountryRiskObject({");
    expect(cacheRead).toBeGreaterThanOrEqual(0);
    expect(cachedReturn).toBeGreaterThan(cacheRead);
    expect(publish).toBeGreaterThan(cachedReturn);
    expect(source).toContain('delivery_profile: "CANONICAL"');
    expect(source).toContain("verifyCommercialRiskObjectArtifact(published.object");
  });

  it("never mutates production for historical/future replay outside a narrow live clock window", () => {
    expect(source).toContain("LIVE_COUNTRY_SELF_HEAL_MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000");
    expect(source).toContain("Math.abs(requested - now.getTime()) <= LIVE_COUNTRY_SELF_HEAL_MAX_CLOCK_SKEW_MS");
    expect(source).toContain("if (!liveSelfHealAllowed(asOf)) return null");
  });

  it("fails closed when signing, evidence or persistence fails", () => {
    const countryBlock = source.slice(
      source.indexOf('if (subject.type === "country")'),
      source.indexOf("const corridorId"),
    );
    expect(countryBlock).toContain("try {");
    expect(countryBlock).toContain("catch {");
    expect(countryBlock).toContain("return null");
    expect(countryBlock).not.toContain("execution_authorized");
    expect(countryBlock).not.toContain("payment");
  });

  it("does not broaden the corridor materialization boundary", () => {
    expect(source).toContain("publishCorridorRiskObject({");
    expect(source).toContain("corridorSubjectId(");
  });
});
