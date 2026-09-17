import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/commercial-launch-strict-evidence.yml",
  "utf8",
);

describe("commercial launch strict evidence workflow", () => {
  it("requires exact published SHA and never load-tests production", () => {
    expect(workflow).toContain("published_sha:");
    expect(workflow).toContain("${PUBLISHED_SHA,,}");
    expect(workflow).toContain("${GITHUB_SHA,,}");
    expect(workflow).toContain("GEOMACRO_EXPECTED_DEPLOYED_SHA: ${{ inputs.published_sha }}");
    expect(workflow).toContain("RISK_GATE_LOAD_TEST_ACK: STAGING_ONLY");
    expect(workflow).toContain("RISK_GATE_STAGING_BASE_URL: ${{ vars.RISK_GATE_STAGING_BASE_URL }}");
    expect(workflow).not.toContain("RISK_GATE_STAGING_BASE_URL: https://geomacro.live");
  });

  it("refuses strict closure without successful same-SHA real distributed capacity evidence", () => {
    expect(workflow).toContain("actions: read");
    expect(workflow).toContain("distributed-capacity-proof:");
    expect(workflow).toContain("million-agent-distributed-staging-execution.yml");
    expect(workflow).toContain("String(run.head_sha || '').toLowerCase() === expectedSha");
    expect(workflow).toContain("run.conclusion === 'success'");
    expect(workflow).toContain("distributed-40k-capacity-pass-${run.id}");
    expect(workflow).toContain("Strict commercial launch closure remains blocked");
    expect(workflow).toContain("needs.distributed-capacity-proof.result");
  });

  it("enforces response-security, bounded load and latency evidence", () => {
    expect(workflow).toContain("scripts/probe-risk-gate-staging-response-security.ts");
    expect(workflow).toContain("scripts/load-test-risk-gate-staging.ts");
    expect(workflow).toContain("scripts/validate-risk-gate-staging-load-report.mjs");
    expect(workflow).toContain("scripts/scale/validate-million-agent-distributed-results.mjs --self-test");
    expect(workflow).toContain("RISK_GATE_LOAD_TEST_MAX_P95_MS: '3000'");
    expect(workflow).toContain("RISK_GATE_LOAD_TEST_MAX_P99_MS: '8000'");
    expect(workflow).toContain("risk-gate-staging-response-security.json");
    expect(workflow).toContain("risk-gate-staging-http-load-validation.json");
  });

  it("keeps public/live checks non-destructive and activation-free", () => {
    expect(workflow).toContain("scripts/ops/live-launch-surface-smoke.mjs");
    expect(workflow).toContain("scripts/ops/external-surface-security-smoke.mjs");
    expect(workflow).toContain("never performs production load, payment settlement, mainnet activation");
    expect(workflow).not.toContain("I_ACCEPT_REAL_USDC");
    expect(workflow).not.toContain("I_AUTHORIZE_COORDINATED_GEOMACRO_LAUNCH");
    expect(workflow).not.toContain("I_AUTHORIZE_PUBLIC_EARLY_WARNING_DISTRIBUTION");
  });
});
