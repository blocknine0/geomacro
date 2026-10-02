import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const workflowPath = ".github/workflows/deploy-commerce-ledger-worker.yml";
const acceptancePath = "scripts/ops/verify-commerce-ledger-worker.mjs";
const controlAcceptancePath = "scripts/ops/verify-commerce-control-plane-worker.mjs";
const workerPackagePath = "workers/commerce-ledger/package.json";
const workflow = readFileSync(workflowPath, "utf8");
const acceptance = readFileSync(acceptancePath, "utf8");
const controlAcceptance = readFileSync(controlAcceptancePath, "utf8");
const workerPackage = JSON.parse(readFileSync(workerPackagePath, "utf8"));

describe("commerce ledger deployment safety", () => {
  it("supports controlled main cutover deploys, remains production-scoped and pinned", () => {
    expect(workflow).toContain("workflow_dispatch: {}");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).toContain("push:");
    expect(workflow).toContain("branches:\n      - main");
    expect(workflow).toContain("workers/commerce-ledger/**");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
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

  it("runs no-funds delivery plus usage/audit acceptance after deploy", () => {
    expect(workflow).toContain("verify-commerce-ledger-worker.mjs");
    expect(workflow).toContain("verify-commerce-control-plane-worker.mjs");
    expect(acceptance).toContain('provider: "acceptance"');
    expect(acceptance).toContain('providerEnvironment: "prelaunch"');
    expect(acceptance).toContain('rail: "synthetic"');
    expect(acceptance).toContain('network: "none"');
    expect(acceptance).toContain('external_payment_performed: false');
    expect(acceptance).toContain('execution_authorized: false');
    expect(acceptance).toContain('replay.disposition !== "REPLAY"');
    expect(acceptance).toContain("COMMERCE_LEDGER_DUPLICATE_SETTLEMENT_NOT_REJECTED");
    expect(controlAcceptance).toContain('external_payment_performed: false');
    expect(controlAcceptance).toContain('execution_authorized: false');
    expect(controlAcceptance).toContain("CONTROL_PLANE_USAGE_SPEND_LIMIT_NOT_ENFORCED");
    expect(controlAcceptance).toContain("CONTROL_PLANE_AUDIT_QUERY_BINDING_MUTABLE");
  });

  it("keeps real-funds activation distinct from control-plane deployment", () => {
    expect(workflow).toContain("Confirm real-funds activation remains separate");
    expect(workflow).toContain("without provider settlement");
    expect(workflow).toContain("mainnet payment activation remains separately gated");
  });

  it("keeps both acceptance scripts syntactically valid", () => {
    for (const path of [acceptancePath, controlAcceptancePath]) {
      const result = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
      expect(result.status, result.stderr || result.stdout).toBe(0);
    }
  });
});