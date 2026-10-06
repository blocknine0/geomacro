import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/day6-authorized-federico-pilot-once.yml",
  "utf8",
);

describe("one-time Day 6 Federico pilot authorization", () => {
  it("refreshes and proves local readiness before partner allowance", () => {
    const refresh = workflow.indexOf("Re-poll governed RSS without partner allowance");
    const corroborate = workflow.indexOf("Corroborate candidates and select first genuinely strict-ready country");
    const local = workflow.indexOf("Dispatch no-allowance current-head local assurance");
    const live = workflow.indexOf("Dispatch exactly one authorized Federico pilot allowance review");
    expect(refresh).toBeGreaterThan(-1);
    expect(corroborate).toBeGreaterThan(refresh);
    expect(local).toBeGreaterThan(corroborate);
    expect(live).toBeGreaterThan(local);
    expect(workflow).toContain("use_partner_allowance=false");
    expect(workflow).toContain("use_partner_allowance=true");
  });

  it("does not authorize user funds or irreversible execution", () => {
    expect(workflow).toContain('"user_funds_authorized":false');
    expect(workflow).toContain('"real_money_payment_authorized":false');
    expect(workflow).toContain('"execution_authorized":false');
    expect(workflow).toContain("github.run_attempt == 1");
  });
});
