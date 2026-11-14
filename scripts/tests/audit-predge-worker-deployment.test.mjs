import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { auditPredgeWorkerDeployment, emitAuditJson } from "../ops/audit-predge-worker-deployment-no-funds.mjs";

const sha = "a".repeat(40);
const version = "99366783-ada4-4166-b6b0-02ec8be8e78b";
const baseEnv = {
  GITHUB_SHA: sha,
  CONTROL_PLANE_URL: "https://geomacro-control-plane.example.workers.dev",
  CLOUDFLARE_ACCOUNT_ID: "b".repeat(32),
  CLOUDFLARE_API_TOKEN: "x".repeat(24),
};
const health = sourceSha => ({
  ok: true, schema_version: 5, deployed_source_sha: sourceSha,
  durable_payload_store: "b2", commerce_ledger: "durable_object",
});
const readiness = {
  status: "ready", authority: "cloudflare-d1", scope: "predge-risk-gate-country-v1",
  checks: {
    database: true, audit_store: true, isolated_partner_credential: true,
    active_pinned_verification_key: true, fresh_verified_commercial_country_gro: true,
    progressive_decision_ed25519_signer_configured: true,
  },
  paid_launch_approved: false, execution_authorized: false,
};
function mockFetch({ sourceSha = sha, split = [{ version_id: version, percentage: 100 }] } = {}) {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url: String(url), method: init.method, headers: init.headers });
    assert.equal(init.method, "GET");
    if (String(url).endsWith("/health")) return Response.json(health(sourceSha));
    if (String(url).endsWith("/v1/public/risk-gate-d1-readiness")) return Response.json(readiness);
    assert.match(String(url), /\/workers\/scripts\/geomacro-control-plane\/deployments\?per_page=1$/u);
    return Response.json({ success: true, result: { deployments: [{ id: "deploy-1", versions: split }] } });
  };
  return { fetchImpl, seen };
}

test("exact-main Worker provider audit passes only with a single 100% version and paid disabled", async () => {
  const { fetchImpl, seen } = mockFetch();
  const result = await auditPredgeWorkerDeployment({ env: baseEnv, fetchImpl, now: new Date("2026-11-14T00:00:00Z") });
  assert.equal(result.status, "PASS");
  assert.equal(result.deployed_source_sha, sha);
  assert.equal(result.predge_paid_launch_approved, false);
  assert.equal(result.execution_authorized, false);
  assert.equal(result.cloudflare.deployment_version_ids[0], version);
  assert.equal(result.traffic_changed, false);
  assert.equal(result.d1_writes, 0);
  assert.equal(result.payments, 0);
  assert.ok(seen.every(x => x.method === "GET"));
  assert.match(seen[2].headers.Authorization, /^Bearer /u);
});

test("stale deployed SHA is an explicit HOLD, not confused with website health", async () => {
  const { fetchImpl } = mockFetch({ sourceSha: "c".repeat(40) });
  const result = await auditPredgeWorkerDeployment({ env: baseEnv, fetchImpl });
  assert.equal(result.worker_health_http_status, 200);
  assert.equal(result.status, "HOLD");
  assert.deepEqual(result.blockers, ["CONTROL_PLANE_WORKER_SOURCE_SHA_STALE"]);
  assert.equal(result.predge_paid_launch_approved, false);
});

test("missing fresh signed commercial GRO is separately surfaced as a delivery blocker", async () => {
  const { fetchImpl } = mockFetch();
  const staleGRO = async (url, init) => {
    const response = await fetchImpl(url, init);
    if (String(url).endsWith("/v1/public/risk-gate-d1-readiness")) {
      const body = structuredClone(readiness);
      body.checks.fresh_verified_commercial_country_gro = false;
      return Response.json(body);
    }
    return response;
  };
  const result = await auditPredgeWorkerDeployment({ env: baseEnv, fetchImpl: staleGRO });
  assert.equal(result.status, "HOLD");
  assert.ok(result.blockers.includes("PREDGE_CURRENT_SIGNED_COMMERCIAL_GRO_UNAVAILABLE"));
  assert.equal(result.predge_paid_launch_approved, false);
});

test("provider split and paid-on states can never be reported as PASS", async () => {
  const { fetchImpl } = mockFetch({ split: [
    { version_id: version, percentage: 99 },
    { version_id: "11111111-2222-3333-4444-555555555555", percentage: 1 },
  ] });
  const result = await auditPredgeWorkerDeployment({ env: baseEnv, fetchImpl });
  assert.equal(result.status, "HOLD");
  assert.ok(result.blockers.includes("CONTROL_PLANE_WORKER_SPLIT_NOT_SINGLE_BASELINE"));

  const paidOn = async (url, init) => {
    const response = await fetchImpl(url, init);
    if (String(url).endsWith("/v1/public/risk-gate-d1-readiness")) {
      const body = { ...readiness, paid_launch_approved: true };
      return Response.json(body);
    }
    return response;
  };
  const paidResult = await auditPredgeWorkerDeployment({ env: baseEnv, fetchImpl: paidOn });
  assert.equal(paidResult.status, "HOLD");
  assert.ok(paidResult.blockers.includes("PREDGE_PAID_OFF_READINESS_NOT_VERIFIED"));
  assert.equal(paidResult.predge_paid_launch_approved, true);
});

test("HOLD CLI output remains a single machine-readable JSON line", () => {
  const lines = [];
  emitAuditJson({ status: "HOLD", blockers: ["CONTROL_PLANE_WORKER_SOURCE_SHA_STALE"] }, line => lines.push(line));
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), {
    status: "HOLD", blockers: ["CONTROL_PLANE_WORKER_SOURCE_SHA_STALE"],
  });
});

test("provider-readback workflow is registered in the canonical inventory", () => {
  const inventory = JSON.parse(readFileSync("config/github-workflow-inventory.v1.json", "utf8"));
  assert.ok(inventory.retainedWorkflowFiles.includes("predge-worker-deployment-no-funds.yml"));
});
