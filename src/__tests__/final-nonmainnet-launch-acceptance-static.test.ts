import fs from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => fs.readFileSync(path, "utf8");

describe("final non-mainnet launch acceptance contract", () => {
  it("keeps every acceptance drill nonproduction and evidence-producing", () => {
    const workflow = read(".github/workflows/final-nonmainnet-launch-acceptance.yml");
    const backup = read("scripts/db/disposable-backup-restore-drill.sh");
    const live = read("scripts/ops/live-launch-surface-smoke.mjs");
    const security = read("scripts/ops/external-surface-security-smoke.mjs");
    const rollback = read("scripts/ops/nonproduction-rollback-incident-drill.mjs");

    expect(workflow).toContain("Final Non-Mainnet Launch Acceptance");
    expect(workflow).toContain("Replay migrations and perform disposable backup/restore drill");
    expect(workflow).toContain("Run live public surface smoke");
    expect(workflow).toContain("Run outside-in non-destructive security smoke");
    expect(workflow).toContain("Run bounded staging Risk Gate load");
    expect(workflow).toContain("Build rollback target");
    expect(workflow).toContain("Run nonproduction rollback and incident drill");

    expect(backup).toContain("DISPOSABLE_LOCAL_ONLY");
    expect(backup).toContain("refusing backup/restore drill against non-local database URL");
    expect(backup).toContain("production_database_touched: false");

    expect(live).toContain("payment_performed: false");
    expect(live).toContain("production_activation_performed: false");
    expect(live).toContain('commerce?.service?.status === "prelaunch"');
    expect(live).toContain('commerce?.commercial_contract?.production_funds_authorized === false');
    expect(live).toContain('discovery?.status === "prelaunch"');
    expect(live).toContain('discovery?.productionFundsAuthorized === false');
    expect(live).toContain('evidence.result = "FAIL"');
    expect(live).toContain("persistEvidence();");

    expect(security).toContain("destructive_testing: false");
    expect(security).toContain("payment_performed: false");
    expect(security).toContain("BOUNDARY: this is not a third-party penetration test or certification");

    expect(rollback).toContain("NONPRODUCTION_ONLY");
    expect(rollback).toContain('manifest.production_funds_authorized === false');
    expect(rollback).toContain("production_activation_performed: false");
  });

  it("keeps host-compatible x402 discovery truthful and prelaunch-only", () => {
    const extensionless = JSON.parse(read("public/.well-known/x402"));
    const json = JSON.parse(read("public/.well-known/x402.json"));

    expect(extensionless).toEqual(json);
    expect(json.x402Version).toBe(2);
    expect(json.status).toBe("prelaunch");
    expect(json.productionFundsAuthorized).toBe(false);
    expect(json.resources).toEqual([]);
    expect(json.boundaries.execution_authorized).toBe(false);
    expect(json.boundaries.wallet_custody).toBe(false);
    expect(json.boundaries.transaction_signing).toBe(false);
    expect(json.plannedResources).toHaveLength(3);
    for (const resource of json.plannedResources) {
      expect(resource.production_enabled).toBe(false);
    }
    expect(json.hosting_fallback.mode).toBe("static_prelaunch");
    expect(json.hosting_fallback.production_launch_rule).toContain("must not advertise paid production resources");
  });

  it("does not embed production launch acknowledgements or permit production load targeting", () => {
    const workflow = read(".github/workflows/final-nonmainnet-launch-acceptance.yml");
    expect(workflow).not.toContain("I_AUTHORIZE_COORDINATED_GEOMACRO_LAUNCH");
    expect(workflow).not.toContain("I_ACCEPT_REAL_USDC");
    expect(workflow).not.toContain("NEVERMINED_X402_ENVIRONMENT: live");
    expect(workflow).toContain("RISK_GATE_LOAD_TEST_ACK: STAGING_ONLY");
    expect(workflow).toContain("scripts/load-test-risk-gate-staging.ts --self-test");
  });
});
