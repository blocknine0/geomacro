import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const ORDERED_BOUNDARY_FILES = [
  "README.md",
  "docs/RISK_GATE.md",
  "src/content/docs/26-agent-intelligence.md",
] as const;

const ADVISORY = "risk gate advisory response: continue / reduce_limit / require_approval / pause";
const POLICY = "customer identity + permissions + policy enforcement";
const ACTION = "customer-controlled";

describe("Risk Gate advisory versus customer enforcement boundary", () => {
  it("places the Geomacro advisory response before customer policy enforcement and customer action", () => {
    for (const path of ORDERED_BOUNDARY_FILES) {
      const content = read(path).toLowerCase();
      const advisory = content.indexOf(ADVISORY);
      const policy = content.indexOf(POLICY);
      const action = content.indexOf(ACTION, policy);

      expect(advisory, `${path} must expose the bounded Risk Gate advisory response`).toBeGreaterThanOrEqual(0);
      expect(policy, `${path} must place customer policy enforcement after the Risk Gate advisory response`).toBeGreaterThan(advisory);
      expect(action, `${path} must place customer-controlled action after customer policy enforcement`).toBeGreaterThan(policy);
    }
  });

  it("keeps a caller-supplied policy profile as an evaluation input rather than customer-side enforcement", () => {
    const readme = read("README.md");
    const riskGate = read("docs/RISK_GATE.md");
    const agentDocs = read("src/content/docs/26-agent-intelligence.md");

    expect(readme).toContain("caller-supplied policy profile");
    expect(readme).toContain("that input is not customer-side policy enforcement");
    expect(riskGate).toContain("That profile is an evaluation input inside the Risk Gate request, not customer-side policy enforcement");
    expect(agentDocs).toContain("that input is not customer-side policy enforcement");
  });

  it("keeps the founder walkthrough explicit about advisory response, customer enforcement and execution", () => {
    const walkthrough = read("docs/FOUNDER_EARLY_ACCESS_WALKTHROUGH.md");
    const advisory = walkthrough.indexOf("Risk Gate v1 returns an advisory state");
    const policy = walkthrough.indexOf("policy-enforcement layer decides how to handle that advisory response");
    const execution = walkthrough.indexOf("downstream execution remains under the customer's control");

    expect(advisory).toBeGreaterThanOrEqual(0);
    expect(policy).toBeGreaterThan(advisory);
    expect(execution).toBeGreaterThan(policy);
    expect(walkthrough).toContain("execution_authorized=false");
  });

  it("preserves the machine non-authorization invariant", () => {
    const contract = read("src/lib/risk-gate-contract.ts");
    const countryService = read("src/lib/risk-gate-service.server.ts");
    const corridorService = read("src/lib/corridor-risk-gate-service.server.ts");

    expect(contract).toContain("execution_authorized: false");
    expect(countryService).toContain("execution_authorized");
    expect(corridorService).toContain("execution_authorized");
  });
});
