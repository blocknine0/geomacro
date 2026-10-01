import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const workflowPath = ".github/workflows/deploy-commerce-ledger-worker.yml";
const acceptancePath = "scripts/ops/verify-commerce-ledger-worker.mjs";
const workerPackagePath = "workers/commerce-ledger/package.json";
const workflow = readFileSync(workflowPath, "utf8");
const acceptance = readFileSync(acceptancePath, "utf8");
const workerPackage = JSON.parse(readFileSync(workerPackagePath, "utf8"));

describe("commerce ledger deployment safety", () => {
  it("is manual-only, production-scoped and pinned", () => {
    expect(workflow).toContain("workflow_dispatch: {}");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).not.toContain("push:");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("cloudflare/wrangler-action@953926a2e2182532811c01a25e53647d93bf07c0");
    expect(workflow).toContain('wranglerVersion: "4.136.3"');
    expect(workflow).toContain("workingDirectory: workers/commerce-ledger");
    expect(workflow).toContain("packageManager: yarn");
    expect(workerPackage.private).toBe(true);
    expect(workerPackage.name).toBe("geomacro-commerce-ledger-worker");
    expect(workerPackage.packageManager).toBe("yarn@1.22.22");
  });

  it("injects only the dedicated shared ledger token into the Worker", () => {
    expect(workflow).toContain("GEOMACRO_COMMERCE_LEDGER_TOKEN");
    expect(workflow).toContain("LEDGER_SHARED_TOKEN");
    expect(workflow).toContain('test "${#LEDGER_SHARED_TOKEN}" -ge 32');
    expect(workflow).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(workflow).not.toContain("RISK_OBJECT_SIGNING_PRIVATE_KEY");
  });

  it("runs a no-funds synthetic acceptance state machine after deploy", () => {
    expect(workflow).toContain("verify-commerce-ledger-worker.mjs");
    expect(acceptance).toContain('provider: "acceptance"');
    expect(acceptance).toContain('providerEnvironment: "prelaunch"');
    expect(acceptance).toContain('rail: "synthetic"');
    expect(acceptance).toContain('network: "none"');
    expect(acceptance).toContain('external_payment_performed: false');
    expect(acceptance).toContain('execution_authorized: false');
    expect(acceptance).toContain('replay.disposition !== "REPLAY"');
    expect(acceptance).toContain("COMMERCE_LEDGER_DUPLICATE_SETTLEMENT_NOT_REJECTED");
  });

  it("keeps activation as a distinct post-deploy gate", () => {
    expect(workflow).toContain("Do not set GEOMACRO_COMMERCE_LEDGER_BACKEND=durable_object");
    expect(workflow).toContain("Supabase-off route acceptance remain separate gates");
  });

  it("keeps the acceptance script syntactically valid", () => {
    const result = spawnSync(process.execPath, ["--check", acceptancePath], { encoding: "utf8" });
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });
});
