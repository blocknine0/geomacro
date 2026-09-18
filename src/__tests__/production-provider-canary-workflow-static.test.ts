import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/production-provider-canary.yml", "utf8");

describe("production provider canary workflow", () => {
  it("is manual-only, main-only and exact-SHA/P0-bound", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("candidate_sha:");
    expect(workflow).toContain("strict_closure_run_id:");
    expect(workflow).toContain(".github/workflows/strict-commercial-launch-closure.yml");
    expect(workflow).toContain("run.head_sha");
    expect(workflow).not.toMatch(/^\s{2}push:/m);
    expect(workflow).not.toMatch(/^\s{2}schedule:/m);
  });

  it("requires one explicit provider, two owner acknowledgements and a hard cap", () => {
    expect(workflow).toContain("options: [coinbase, circle, nevermined]");
    expect(workflow).toContain("I_AUTHORIZE_ONE_CAPPED_INTERNAL_REAL_MONEY_CANARY");
    expect(workflow).toContain("I_AUTHORIZE_COINBASE_CAPPED_CANARY");
    expect(workflow).toContain("I_AUTHORIZE_CIRCLE_CAPPED_CANARY");
    expect(workflow).toContain("I_AUTHORIZE_NEVERMINED_CAPPED_CANARY");
    expect(workflow).toContain("max_usdc must be >0 and <=1 USDC");
  });

  it("uses a protected canary environment and never sets server launch acknowledgements", () => {
    expect(workflow).toContain("environment: production-canary");
    expect(workflow).toContain("GEOMACRO_PRODUCTION_CANARY_BASE_URL");
    expect(workflow).toContain("GEOMACRO_PRODUCTION_CANARY_EXPECTED_HOST");
    expect(workflow).not.toMatch(/^\s{6}GEOMACRO_COMMERCIAL_LAUNCH_ACK:/m);
    expect(workflow).not.toMatch(/^\s{6}GEOMACRO_REAL_FUNDS_SECURITY_ACK:/m);
    expect(workflow).not.toMatch(/^\s{6}COINBASE_X402_MAINNET_ACK:/m);
    expect(workflow).not.toMatch(/^\s{6}CIRCLE_X402_MAINNET_ACK:/m);
    expect(workflow).not.toMatch(/^\s{6}NEVERMINED_X402_ENVIRONMENT:/m);
  });

  it("reconciles every canary as internal non-revenue and uploads sanitized evidence only", () => {
    expect(workflow).toContain("GEOMACRO_RECONCILIATION_MODE: internal_canary");
    expect(workflow).toContain("GEOMACRO_PURCHASE_CLASSIFICATION: internal_canary");
    expect(workflow).toContain("I_RECONCILE_VERIFIED_PRODUCTION_DELIVERY");
    expect(workflow).toContain("/tmp/geomacro-production-canary-private-handoff.json");
    expect(workflow).toContain("Destroy private handoff");
    expect(workflow).toContain("Upload sanitized canary and reconciliation evidence only");
    expect(workflow).not.toContain("path: /tmp/geomacro-production-canary-private-handoff.json");
  });

  it("does not persist buyer payment proof or production wallet secrets", () => {
    expect(workflow).toContain("secrets.GEOMACRO_COINBASE_PRODUCTION_CANARY_BUYER_PRIVATE_KEY");
    expect(workflow).toContain("secrets.GEOMACRO_CIRCLE_PRODUCTION_CANARY_BUYER_PRIVATE_KEY");
    expect(workflow).toContain("secrets.GEOMACRO_NEVERMINED_PRODUCTION_CANARY_PAYMENT_SIGNATURE");
    expect(workflow).not.toContain("echo $GEOMACRO_COINBASE_PRODUCTION_CANARY_BUYER_PRIVATE_KEY");
    expect(workflow).not.toContain("echo $GEOMACRO_CIRCLE_PRODUCTION_CANARY_BUYER_PRIVATE_KEY");
    expect(workflow).not.toContain("echo $GEOMACRO_NEVERMINED_PRODUCTION_CANARY_PAYMENT_SIGNATURE");
  });
});
