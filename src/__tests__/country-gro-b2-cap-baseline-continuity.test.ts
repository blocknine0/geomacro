import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const publisher = readFileSync("src/lib/country-risk-publisher.server.ts", "utf8");
const engine = readFileSync("src/lib/country-risk-engine.ts", "utf8");

describe("#1414 country GRO refresh under external B2 archive caps", () => {
  it("keeps the prior GRO optional and delta-only in the deterministic engine", () => {
    expect(engine).toContain("Optional previous compatible country GRO.");
    expect(engine).toContain("Used only for deterministic delta attribution.");
    expect(engine).toContain("previousScore === null");
    expect(engine).toContain("function directionFromDelta(");
    expect(engine).toContain('if (delta === null)');
    expect(engine).toContain('return "unknown";');
  });

  it("drops only an unavailable historical baseline for explicit B2 account caps", () => {
    expect(publisher).toContain('message === "B2_DOWNLOAD_CAP_EXCEEDED"');
    expect(publisher).toContain('message === "B2_TRANSACTION_CAP_EXCEEDED"');
    expect(publisher).toContain("if (!archiveBaselineTemporarilyUnavailable(error))");
    expect(publisher).toContain("throw error;");
    expect(publisher).toContain('status: "ARCHIVE_CAP_UNAVAILABLE"');
    expect(publisher).toContain("previousBaseline.object");
  });

  it("does not weaken current evidence, signing, persistence or read-back verification", () => {
    expect(publisher).toContain("loadRecentStructuredEvents(");
    expect(publisher).toContain("applyCountryRiskCommercialEligibility(");
    expect(publisher).toContain("signRiskObject(");
    expect(publisher).toContain("persistRiskObject(");
    expect(publisher).toContain("getRiskObjectByObjectId(");
    expect(publisher).toContain("verifyRiskObjectSignature(");
  });
});
