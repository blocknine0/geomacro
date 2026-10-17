import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/production-website-health.yml", "utf8");

const independentGates = [
  "Verify live build marker matches canonical main",
  "Verify Lovable mirror source parity",
  "Verify B2 production serving health",
  "Verify live D1 control plane and fail-closed auth",
  "Verify production alignment contract",
  "Verify independent Global Risk and Risk Indices edges",
  "Verify public production APIs and current Intelligence contract",
  "Verify free homepage, Ask and D1-derived Finds without credentials",
] as const;

describe("independent production website failure diagnostics", () => {
  it("runs independent gates after an earlier SHA or current-hot-product failure", () => {
    for (const name of independentGates) {
      const offset = workflow.indexOf("      - name: " + name + "\n");
      expect(offset, name).toBeGreaterThanOrEqual(0);
      const nextStep = workflow.indexOf("\n      - name: ", offset + 1);
      const step = workflow.slice(offset, nextStep < 0 ? undefined : nextStep);
      expect(step, name).toContain("if: ${{ !cancelled() }}");
      expect(step, name).not.toContain("continue-on-error:");
    }
  });

  it("keeps manual Lovable publication failures actionable without wasting a 20-minute job", () => {
    expect(workflow).toContain("seq 1 8");
    expect(workflow).not.toContain("seq 1 40");
    expect(workflow).toContain("LIVE_DEPLOYMENT_SHA_MISMATCH");
    expect(workflow).toContain("Lovable Publish required or incomplete");
    expect(workflow).toContain("Verify Lovable mirror source parity");
  });

  it("does not weaken B2/D1 freshness, signed edge, or x402 fail-closed acceptance", () => {
    expect(workflow).toContain("status: deepReady ? 200 : 503").toBe(false);
    expect(workflow).toContain("Verify B2 production serving health");
    expect(workflow).toContain('"\"intelligence_ready\":true"');
    expect(workflow).toContain('"\"global_risk_ready\":true"');
    expect(workflow).toContain('"\"risk_indices_ready\":true"');
    expect(workflow).toContain("Verify live D1 control plane and fail-closed auth");
    expect(workflow).toContain("Verify independent Global Risk and Risk Indices edges");
    expect(workflow).not.toContain("continue-on-error: true");
  });
});
