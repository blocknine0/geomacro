import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { semanticRiskGateAction } from "../lib/risk-gate-explainability";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("Risk Gate recommended_action advisory semantics", () => {
  it("preserves the versioned v1 compatibility mapping", () => {
    expect(semanticRiskGateAction("CONTINUE")).toBe("ALLOW");
    expect(semanticRiskGateAction("REDUCE_LIMIT")).toBe("REDUCE_EXPOSURE");
    expect(semanticRiskGateAction("REQUIRE_APPROVAL")).toBe("REQUIRE_HUMAN_APPROVAL");
    expect(semanticRiskGateAction("PAUSE")).toBe("BLOCK");
  });

  it("documents that ALLOW is advisory and never execution permission", () => {
    const contract = read("src/lib/risk-gate-contract.ts");
    const semantics = read("docs/RISK_GATE_ADVISORY_ACTIONS.md");

    expect(contract).toContain("`ALLOW` means only that the supplied Risk Gate policy profile produced no");
    expect(contract).toContain("It is never transaction permission");
    expect(contract).toContain("execution_authorized=false");
    expect(semantics).toContain('Consumers must not use `recommended_action="ALLOW"` as a standalone signal to submit a transaction');
    expect(semantics).toContain("Customer-side identity, permissions, policy ownership and enforcement");
  });

  it("keeps the external v1 schema paired with an explicit false execution boundary", () => {
    const openapi = read("docs/openapi/geomacro-v1.yaml");

    expect(openapi).toContain("enum: [ALLOW, REDUCE_EXPOSURE, REQUIRE_HUMAN_APPROVAL, BLOCK]");
    expect(openapi).toContain("execution_authorized:");
    expect(openapi).toContain("const: false");
  });
});
