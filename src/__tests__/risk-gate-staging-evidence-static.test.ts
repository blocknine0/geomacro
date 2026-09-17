import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/risk-gate-staging-load.yml",
  "utf8",
);
const p0Workflow = readFileSync(
  ".github/workflows/p0-security-resilience-evidence.yml",
  "utf8",
);
const loadHarness = readFileSync(
  "scripts/load-test-risk-gate-staging.ts",
  "utf8",
);
const responseProbe = readFileSync(
  "scripts/probe-risk-gate-staging-response-security.ts",
  "utf8",
);
const reportValidator = readFileSync(
  "scripts/validate-risk-gate-staging-load-report.mjs",
  "utf8",
);
const docs = readFileSync(
  "docs/RISK_GATE_STAGING_LOAD_TEST.md",
  "utf8",
);

const requiredScripts = [
  "scripts/load-test-risk-gate-staging.ts",
  "scripts/probe-risk-gate-staging-response-security.ts",
  "scripts/validate-risk-gate-staging-load-report.mjs",
];

describe("Risk Gate staging evidence contract", () => {
  it("keeps production-target protection and response security checks in the dedicated staging workflow", () => {
    for (const script of requiredScripts) {
      expect(workflow).toContain(script);
    }

    expect(workflow).toContain("RISK_GATE_LOAD_TEST_ACK: STAGING_ONLY");
    expect(workflow).toContain("RISK_GATE_LOAD_TEST_MAX_P95_MS: '3000'");
    expect(workflow).toContain("RISK_GATE_LOAD_TEST_MAX_P99_MS: '8000'");
    expect(workflow).toContain("Probe staging response security boundary");
    expect(workflow).toContain("Enforce prelaunch staging SLO and zero-error gates");
    expect(workflow).toContain("risk-gate-staging-response-security.json");
    expect(workflow).toContain("risk-gate-staging-http-load-validation.json");
  });

  it("refuses HTTP redirects and requires explicit execution plus response security on every load response", () => {
    expect(loadHarness).toContain('redirect: "error"');
    expect(responseProbe).toContain('redirect: "error"');
    expect(loadHarness).toContain("executionBoundaryIsExplicitlyFalse(payload)");
    expect(loadHarness).toContain("response_security_violations");
    expect(loadHarness).toContain("raw.includes(apiKey)");
    expect(reportValidator).toContain("'response_security_violations'");
    expect(reportValidator).toContain("redirect_policy !== 'error'");
  });

  it("keeps the new staging evidence contracts inside the P0 security gate", () => {
    expect(p0Workflow).toContain(
      "scripts/probe-risk-gate-staging-response-security.ts --self-test",
    );
    expect(p0Workflow).toContain(
      "scripts/validate-risk-gate-staging-load-report.mjs --self-test",
    );
    expect(p0Workflow).toContain("Production/customer load test performed here: false");
  });

  it("documents the evidence boundary without overstating production capacity", () => {
    expect(docs).toContain("p95 HTTP latency <= **3,000 ms**");
    expect(docs).toContain("p99 HTTP latency <= **8,000 ms**");
    expect(docs).toContain("not a claim about an external industry standard or a production SLA");
    expect(docs).toContain("**PENDING REAL STAGING RUN.**");
  });
});
