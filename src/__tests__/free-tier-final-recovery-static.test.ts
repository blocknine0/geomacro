import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/free-tier-final-recovery.yml", "utf8");

describe("free-tier final recovery orchestrator", () => {
  it("is manual-only, production-scoped, and requires explicit acknowledgement", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).not.toContain("push:");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("I_ACCEPT_VERIFIED_EVIDENCE_COLD_DELETE");
    expect(workflow).toContain("persist-credentials: false");
  });

  it("keeps recovery stages in fail-closed order", () => {
    const raw = workflow.indexOf("b2-country-ingest-offload.mjs");
    const archive = workflow.indexOf("b2-archive-structured-evidence-bundle.mjs");
    const cold = workflow.indexOf("b2-delete-verified-structured-evidence-bundles.mjs");
    expect(raw).toBeGreaterThanOrEqual(0);
    expect(archive).toBeGreaterThan(raw);
    expect(cold).toBeGreaterThan(archive);
    expect(workflow).toContain("HISTORICAL_RAW_DRAIN_BOUNDED_LIMIT_REACHED");
    expect(workflow).toContain("STRUCTURED_EVIDENCE_ARCHIVE_BOUNDED_LIMIT_REACHED");
    expect(workflow).toContain("STRUCTURED_EVIDENCE_PHASE_B_BOUNDED_LIMIT_REACHED");
  });

  it("starts each recovery phase with a canary and preserves request retry headroom", () => {
    expect(workflow).toContain("Historical raw drain canary");
    expect(workflow).toContain("Structured evidence archive canary");
    expect(workflow).toContain("Verified Phase B cold-delete canary");
    expect(workflow).toContain("B2_INGEST_RAW_ROUNDS=16");
    expect(workflow).toContain("STRUCTURED_EVIDENCE_PHASE_B_ROUNDS=8");
    expect(workflow).toContain("B2_REQUEST_BUDGET=30");
  });

  it("does not activate commercial mainnet acknowledgements", () => {
    expect(workflow).not.toContain("GEOMACRO_COMMERCIAL_LAUNCH_ACK");
    expect(workflow).not.toContain("COINBASE_X402_MAINNET_ACK");
  });
});
