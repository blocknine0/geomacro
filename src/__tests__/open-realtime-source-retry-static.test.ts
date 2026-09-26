import fs from "node:fs";
import { describe, expect, it } from "vitest";

const runner = fs.readFileSync("scripts/run-open-live-source-mesh-with-retry.mjs", "utf8");
const productionGate = fs.readFileSync(".github/workflows/global-production-coverage-gate.yml", "utf8");
const operatorWorkflow = fs.readFileSync(".github/workflows/open-realtime-source-mesh.yml", "utf8");

describe("open realtime source retry contract", () => {
  it("retries transient upstream failures but remains fail-closed after exhaustion", () => {
    expect(runner).toContain("OPEN_LIVE_SOURCE_MAX_ATTEMPTS ?? 3");
    expect(runner).toContain("OPEN_LIVE_SOURCE_SYNC_RETRYING");
    expect(runner).toContain("OPEN_LIVE_SOURCE_SYNC_RETRY_EXHAUSTED");
    expect(runner).toContain("process.exit(lastCode || 1)");
  });

  it("uses the retry runner in both governed workflows", () => {
    expect(productionGate).toContain("node scripts/run-open-live-source-mesh-with-retry.mjs");
    expect(operatorWorkflow).toContain("node scripts/run-open-live-source-mesh-with-retry.mjs");
  });

  it("does not weaken production readiness or payment safety boundaries", () => {
    expect(productionGate).toContain('GLOBAL_CANONICAL_MIN_READY: "100"');
    expect(productionGate).toContain('GLOBAL_CANONICAL_MIN_SOVEREIGN_DENOMINATOR: "190"');
    expect(productionGate).toContain("payment_not_performed_by_refresh == true");
    expect(productionGate).toContain("execution_authorized == false");
  });
});
