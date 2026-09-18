import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/external-production-revenue-proof.yml", "utf8");
const verifier = readFileSync("scripts/commerce/verify-public-revenue-proof.mjs", "utf8");
const reconcile = readFileSync("scripts/ops/reconcile-agent-commerce-payment.mjs", "utf8");

describe("external-only production revenue proof", () => {
  it("is manual, exact-SHA and final-acceptance gated", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toMatch(/^\s{2}push:/m);
    expect(workflow).not.toMatch(/^\s{2}schedule:/m);
    expect(workflow).toContain("final_acceptance_run_id:");
    expect(workflow).toContain(".github/workflows/final-production-acceptance.yml");
    expect(workflow).toContain("run.head_sha");
  });

  it("cannot classify a controlled canary as revenue", () => {
    expect(workflow).toContain("I_CONFIRM_THIS_IS_NOT_A_CONTROLLED_CANARY");
    expect(workflow).toContain("options: [external_customer, independent_production_buyer]");
    expect(workflow).toContain("GEOMACRO_RECONCILIATION_MODE: commercial_revenue");
    expect(workflow).not.toContain("purchase_classification: internal_canary");
    expect(reconcile).toContain("commercial_revenue reconciliation requires an external or independent production buyer");
  });

  it("requires settled matched external evidence and publishes only hashes", () => {
    expect(verifier).toContain('evidence.payment_status !== "settled"');
    expect(verifier).toContain('evidence.reconciliation_status !== "matched"');
    expect(verifier).toContain('evidence.internal_canary !== false');
    expect(verifier).toContain("EXTERNAL_CLASSES");
    expect(verifier).toContain("single_payment_event_for_settlement");
    expect(verifier).toContain("payment_event_count_for_settlement");
    expect(verifier).toContain("customer_identity_disclosed: false");
    expect(verifier).toContain("raw_payment_or_settlement_proof_disclosed: false");
    expect(workflow).toContain("bun install --frozen-lockfile --ignore-scripts");
    expect(workflow).toContain("Upload sanitized revenue proof only");
    expect(workflow).not.toContain("path: /tmp/revenue/reconciliation.json");
  });
});
