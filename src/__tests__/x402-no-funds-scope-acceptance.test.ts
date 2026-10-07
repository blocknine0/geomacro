import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("#1414 no-funds x402 scope acceptance", () => {
  it("proves all five commercial scopes without ever sending payment proof", () => {
    const script = read("scripts/agentic/verify-live-x402-no-funds-scope-acceptance.mjs");
    const workflow = read(".github/workflows/live-x402-prelaunch-availability.yml");

    for (const marker of [
      "geopolitics-deu",
      "macro-bra",
      "critical-minerals-zaf",
      "country-usa",
      "corridor-usa-chn",
    ]) {
      expect(script).toContain(marker);
    }

    expect(script).toContain("challengeResponse.status !== 402");
    expect(script).toContain("QUERY_PLAN_NOT_BOUND_TO_CHALLENGE");
    expect(script).toContain("payment_signature_sent: false");
    expect(script).toContain("settlement_attempted: false");
    expect(script).toContain("all_scopes_passed: failures.length === 0");
    expect(script).toContain("missing_modules: Array.isArray(publicAvailability?.missing_modules)");
    expect(script).toContain("stale_modules: Array.isArray(publicAvailability?.stale_modules)");
    expect(script).toContain("governed_fallback_modules");
    expect(script).toContain("latest_evidence_at");
    expect(script).toContain("safeCaseFailure(testCase, error)");
    expect(script).toContain("X402_SCOPE_ACCEPTANCE_FAILED:");
    expect(script).toContain("process.exitCode = 1");
    expect(script).toContain("writeFileSync(OUT");
    expect(script).not.toContain("console.error(error.stack");
    expect(script).not.toContain("console.error(error.message");
    expect(script).not.toContain('\"payment-signature\"');
    expect(script).not.toContain("'payment-signature'");
    expect(script).not.toContain("settleCoinbaseX402");
    expect(script).not.toContain("verifyCoinbaseX402");

    expect(workflow).toContain("verify-live-x402-no-funds-scope-acceptance.mjs");
    expect(workflow).toContain("verify-live-x402-country-availability-census.mjs");
    expect(workflow).toContain("Payment performed: false");
    expect(workflow).toContain("Real funds touched: false");
  });
});
