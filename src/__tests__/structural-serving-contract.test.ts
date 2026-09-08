import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const source = readFileSync(
  join(ROOT, "src/lib/structural-context.server.ts"),
  "utf8",
);
const docs = readFileSync(
  join(ROOT, "docs/STRUCTURAL_CONTEXT_BACKEND.md"),
  "utf8",
);

describe("structural serving consumer contract", () => {
  it("prefers the governed country and corridor serving views", () => {
    expect(source).toContain(
      '.from("commercial_structural_country_profiles")',
    );
    expect(source).toContain(
      '.from("commercial_structural_country_coverage_latest")',
    );
    expect(source).toContain(
      '.from("commercial_structural_corridor_latest")',
    );
  });

  it("never queries the private raw structural table", () => {
    expect(source).not.toContain(
      '.from("structural_geopolitical_observations")',
    );
    expect(docs).toContain(
      "The main product must never query the private raw table",
    );
  });

  it("limits base-view fallback to missing serving relations", () => {
    expect(source).toContain(
      "if (isMissingStructuralServingRelation(error))",
    );
    expect(source).toContain('code === "42P01"');
    expect(source).toContain('code === "PGRST205"');
    expect(source).toContain(
      '.from("commercial_structural_geopolitical_observations")',
    );
    expect(docs).toContain(
      "only when PostgREST/PostgreSQL reports that a serving relation is genuinely missing",
    );
  });

  it("keeps structural evidence outside current GRI and GRO scoring", () => {
    expect(source).toContain("EVIDENCE_ONLY_NOT_IN_GRI_V1_2");
    expect(source).toContain("EVIDENCE_ONLY_NOT_IN_GRO_V02");
    expect(source).not.toContain("structural_risk_score");
    expect(source).not.toContain("execution_authorized: true");
    expect(docs).toContain(
      "it does not silently modify the signed GRO v0.2 score contract",
    );
  });

  it("keeps corridor semantics endpoint-composed and explicitly not route modeled", () => {
    expect(source).toContain("ENDPOINT_COMPOSED_V0_1");
    expect(source).toContain("NOT_MODELED");
    expect(source).toContain("NO_DIRECT_BILATERAL_EVIDENCE");
    expect(docs).toContain(
      "not full route, maritime, logistics, counterparty",
    );
  });

  it("discloses coverage without turning missing data into zero risk", () => {
    expect(source).toContain("coverage: StructuralCoverage[]");
    expect(source).toContain(
      "Missing structural data is disclosed and is never interpreted as zero risk.",
    );
    expect(docs).toContain(
      "Structural evidence is never converted into a zero-risk value.",
    );
  });
});
