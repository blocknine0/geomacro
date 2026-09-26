import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/global-production-coverage-gate.yml",
  "utf8",
);

describe("global production coverage evidence ordering", () => {
  it("repairs governed GDELT evidence before sovereign CANONICAL Risk Objects are generated", () => {
    const gdelt = workflow.indexOf(
      "- name: Self-heal GDELT GAL freshness before sovereign CANONICAL refresh",
    );
    const canonical = workflow.indexOf(
      "- name: Refresh every enabled sovereign CANONICAL Risk Object",
    );

    expect(gdelt).toBeGreaterThan(-1);
    expect(canonical).toBeGreaterThan(-1);
    expect(gdelt).toBeLessThan(canonical);
  });

  it("keeps the GDELT repair governed and fail-closed", () => {
    expect(workflow).toContain("node scripts/run-gdelt-gal-cycle.mjs");
    expect(workflow).toContain("LIVE_STRUCTURE_TOKEN");
    expect(workflow).toContain("AUTHORITATIVE_SUPABASE_CREDENTIALS_REQUIRED");
    expect(workflow).toContain("NON_AUTHORITATIVE_SUPABASE_PROJECT");
    expect(workflow).toContain(
      "PASS: GDELT GAL FRESH CYCLE COMPLETE; CURSOR, FRAGMENT, STRUCTURE, RIGHTS AND HOT-TOPIC HEALTH VERIFIED",
    );
  });

  it("does not weaken canonical readiness or payment safety boundaries", () => {
    expect(workflow).toContain('GLOBAL_CANONICAL_MIN_READY: "100"');
    expect(workflow).toContain('GLOBAL_CANONICAL_MIN_SOVEREIGN_DENOMINATOR: "190"');
    expect(workflow).toContain(".boundaries.payment_not_performed_by_refresh == true");
    expect(workflow).toContain(".boundaries.raw_source_material_emitted == false");
    expect(workflow).toContain(".boundaries.execution_authorized == false");
  });
});
