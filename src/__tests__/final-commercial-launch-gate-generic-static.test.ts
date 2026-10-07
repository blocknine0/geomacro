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

  it("runs the final production gate only after exact-head GRO continuity and still requires exact-head readiness", () => {
    expect(finalWorkflow).toContain("Final Commercial Launch Gate");
    expect(finalWorkflow).toContain("B2 country GRO continuity");
    expect(finalWorkflow).toContain("Exact-Head Commercial Launch Readiness");
    expect(finalWorkflow).not.toContain("Day 6 Partner Assurance Final");
    expect(finalWorkflow).not.toContain("day6-partner-assurance");
    expect(finalWorkflow).not.toContain("--partner federico");
    expect(finalWorkflow).not.toContain("Partner Commercial Readiness");
    expect(finalWorkflow).toContain("verify-generic-production-risk-object.ts");
    expect(finalWorkflow).toContain('"B2 country GRO continuity"]');
    expect(finalWorkflow).toContain("gro_continuity_run_id:process.env.UPSTREAM_RUN_ID");
  });

  it("accepts only fresh successful production Intelligence publication owners", () => {
    expect(finalWorkflow).toContain("actions/workflows/intelligence-scored-refresh.yml/runs");
    expect(finalWorkflow).toContain("actions/workflows/intelligence-fastlane-publication.yml/runs");
    expect(finalWorkflow).toContain("Intelligence Scored + Current Evidence");
    expect(finalWorkflow).toContain("Intelligence Fastlane Publication Sync");
    expect(finalWorkflow).toContain("intelligence-scored-refresh");
    expect(finalWorkflow).toContain("intelligence-fastlane-publication");
    expect(finalWorkflow).toContain("run.status === 'completed'");
    expect(finalWorkflow).toContain("run.conclusion === 'success'");
    expect(finalWorkflow).toContain("ageMs <= maxAgeMs");
    expect(finalWorkflow).toContain("6 * 60 * 60 * 1000");
    expect(finalWorkflow).toContain("PRODUCTION_INTELLIGENCE_PUBLICATION_PROOF_MISSING");
    expect(finalWorkflow).not.toContain("pipeline='governed_source_ingestion'");
    expect(finalWorkflow).not.toContain("No fresh successful governed ingestion checkpoint");
  });

  it("streams workflow-run API payloads through files instead of oversized environment variables", () => {
    expect(finalWorkflow).toContain("/tmp/final-intelligence-runs.json");
    expect(finalWorkflow).toContain("/tmp/final-fastlane-publication-runs.json");
    expect(finalWorkflow).toContain("/tmp/final-exact-head-runs.json");
    expect(finalWorkflow).toContain("fs.readFileSync(source.file,'utf8')");
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
    expect(verifier).toContain("https://geomacro.live/.well-known/geomacro-build.json");
    expect(verifier).toContain("geomacro.deployment-build.v1");
    expect(verifier).toContain("PRODUCTION_DEPLOYMENT_SHA_MISMATCH");
    expect(verifier).toContain("GENERIC_RISK_OBJECT_NOT_FRESH");
    expect(verifier).toContain("GENERIC_RISK_OBJECT_TAMPER_NOT_REJECTED");
    expect(verifier).toContain("client_local_with_public_keys");
    expect(verifier).toContain("GENERIC_RISK_OBJECT_PUBLIC_VERIFIER_PROBE_FAILED");
    expect(verifier).toContain("verification_mode: verificationMode");
    expect(verifier).toContain("supabase_credentials_present: false");
    expect(verifier).toContain("external_payment_performed: false");
  });
});
