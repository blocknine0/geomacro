import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const exactHead = read(".github/workflows/exact-head-commercial-launch-readiness.yml");
const finalWorkflow = read(".github/workflows/day7-final-commercial-launch-gate.yml");
const finalGate = read("scripts/ops/final-launch-gate-core.mjs");
const simulations = read("scripts/ops/simulate-final-launch-failures.mjs");
const verifier = read("scripts/ops/verify-generic-production-risk-object.ts");

describe("#1414 partner-independent final commercial launch gate", () => {
  it("keeps Federico-specific assurance outside the exact-head launch scope", () => {
    expect(exactHead).not.toContain("federico-");
    expect(exactHead).not.toContain("partner-assurance");
    expect(exactHead).toContain("risk-object-key-lifecycle.test.ts");
    expect(exactHead).toContain("risk-object-independent-trust.test.ts");
    expect(exactHead).toContain("risk-object-public-verification-route.test.ts");
  });

  it("drives the final production gate from exact-head readiness rather than Day 6 partner assurance", () => {
    expect(finalWorkflow).toContain("Final Commercial Launch Gate");
    expect(finalWorkflow).toContain("Exact-Head Commercial Launch Readiness");
    expect(finalWorkflow).not.toContain("Day 6 Partner Assurance Final");
    expect(finalWorkflow).not.toContain("day6-partner-assurance");
    expect(finalWorkflow).not.toContain("--partner federico");
    expect(finalWorkflow).not.toContain("Partner Commercial Readiness");
    expect(finalWorkflow).toContain("verify-generic-production-risk-object.ts");
  });

  it("anchors scheduler health to the production Intelligence owner instead of the non-commercial governed-source canary", () => {
    expect(finalWorkflow).toContain("actions/workflows/intelligence-scored-refresh.yml/runs");
    expect(finalWorkflow).toContain("Intelligence Scored + Current Evidence");
    expect(finalWorkflow).toContain("intelligence-scored-refresh");
    expect(finalWorkflow).toContain("latest.conclusion !== 'success'");
    expect(finalWorkflow).toContain("6 * 60 * 60 * 1000");
    expect(finalWorkflow).not.toContain("pipeline='governed_source_ingestion'");
    expect(finalWorkflow).not.toContain("No fresh successful governed ingestion checkpoint");
  });

  it("streams workflow-run API payloads through files instead of oversized environment variables", () => {
    expect(finalWorkflow).toContain("/tmp/final-intelligence-runs.json");
    expect(finalWorkflow).toContain("/tmp/final-exact-head-runs.json");
    expect(finalWorkflow).toContain("fs.readFileSync('/tmp/final-intelligence-runs.json','utf8')");
    expect(finalWorkflow).toContain("fs.readFileSync('/tmp/final-exact-head-runs.json','utf8')");
    expect(finalWorkflow).not.toContain('RUNS="$JSON"');
  });

  it("requires generic public Risk Object trust and remains no-funds/fail-closed", () => {
    for (const marker of [
      "d1_primary_control_plane",
      "b2_durable_authority",
      "durable_object_commerce",
      "supabase_cold_standby",
      "risk_object_trust",
      "scheduler_health",
      "exact_head_gates",
    ]) {
      expect(finalGate).toContain(marker);
    }
    expect(finalGate).toContain('partner_specific_assurance_required: false');
    expect(finalGate).toContain("real_funds_authorized: false");
    expect(finalGate).toContain("execution_authorized: false");
    expect(simulations).toContain("risk_object_trust_failure");
    expect(simulations).toContain("signing_failure");
    expect(simulations).toContain("DID_NOT_FAIL_CLOSED");
  });

  it("verifies one fresh commercial GRO from D1/B2 against deployed public trust without Supabase", () => {
    expect(verifier).toContain("RISK_OBJECT_INDEX_FILE");
    expect(verifier).toContain("geomacro-evidence\\/v1\\/gro\\/");
    expect(verifier).toContain("verifyRiskObjectSignature");
    expect(verifier).toContain("https://geomacro.live/api/risk-object-keys");
    expect(verifier).toContain("GENERIC_RISK_OBJECT_NOT_FRESH");
    expect(verifier).toContain("GENERIC_RISK_OBJECT_TAMPER_NOT_REJECTED");
    expect(verifier).toContain("supabase_credentials_present: false");
    expect(verifier).toContain("external_payment_performed: false");
  });
});
