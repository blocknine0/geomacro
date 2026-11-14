#!/usr/bin/env node
/** Read-only Cloudflare/HTTP state for the Predge Control Plane Worker. */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const WORKER = "geomacro-control-plane";
const SHA = /^[a-f0-9]{40}$/u;
const UUID = /^[a-f0-9-]{36}$/iu;
const fail = code => { throw new Error(code); };

async function jsonResponse(response) {
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

function deploymentShape(deployment) {
  const versions = deployment?.versions;
  if (!Array.isArray(versions) || versions.length < 1 || versions.length > 10) return null;
  const normalized = versions.map(row => ({
    version_id: String(row?.version_id ?? ""),
    percentage: Number(row?.percentage),
  }));
  if (normalized.some(row => !UUID.test(row.version_id) ||
      !Number.isFinite(row.percentage) || row.percentage < 0 || row.percentage > 100) ||
      Math.abs(normalized.reduce((sum, row) => sum + row.percentage, 0) - 100) > 0.001) return null;
  return normalized;
}

export async function auditPredgeWorkerDeployment({
  env = process.env,
  fetchImpl = fetch,
  now = new Date(),
} = {}) {
  const expected = String(env.GITHUB_SHA ?? env.EXPECTED_SOURCE_SHA ?? "");
  const origin = String(env.CONTROL_PLANE_URL ?? "").replace(/\/+$/u, "");
  if (!SHA.test(expected)) fail("PREDGE_WORKER_EXPECTED_SHA_INVALID");
  let parsedOrigin;
  try { parsedOrigin = new URL(origin); } catch { fail("PREDGE_WORKER_ORIGIN_INVALID"); }
  if (parsedOrigin.protocol !== "https:" || parsedOrigin.username || parsedOrigin.password ||
      parsedOrigin.port || !["", "/"].includes(parsedOrigin.pathname) || parsedOrigin.search || parsedOrigin.hash)
    fail("PREDGE_WORKER_ORIGIN_INVALID");

  const request = async url => {
    try {
      const response = await fetchImpl(url, {
        method: "GET", redirect: "error", cache: "no-store",
        headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000),
      });
      return await jsonResponse(response);
    } catch { return { status: 0, body: null }; }
  };
  const [health, readiness] = await Promise.all([
    request(origin + "/health"),
    request(origin + "/v1/public/risk-gate-d1-readiness"),
  ]);
  const h = health.body, r = readiness.body;
  const workerHealthOk = health.status === 200 && h?.ok === true &&
    Number.isInteger(h.schema_version) && h.schema_version >= 1 &&
    SHA.test(String(h.deployed_source_sha ?? ""));
  const predgeReadinessOk = readiness.status === 200 && r?.status === "ready" &&
    r?.authority === "cloudflare-d1" && r?.scope === "predge-risk-gate-country-v1" &&
    r?.checks?.database === true && r?.checks?.audit_store === true &&
    r?.checks?.isolated_partner_credential === true &&
    r?.checks?.active_pinned_verification_key === true &&
    r?.checks?.progressive_decision_ed25519_signer_configured === true &&
    r?.paid_launch_approved === false && r?.execution_authorized === false;

  let cloudflare = { status: "UNAVAILABLE", deployment_version_ids: [], traffic_split: [] };
  const account = String(env.CLOUDFLARE_ACCOUNT_ID ?? "");
  const token = String(env.CLOUDFLARE_API_TOKEN ?? "");
  if (/^[a-f0-9]{32}$/u.test(account) && token.length >= 20) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${WORKER}/deployments?per_page=1`;
    try {
      const response = await fetchImpl(url, {
        method: "GET", redirect: "error", cache: "no-store",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(12000),
      });
      const body = await response.json().catch(() => null);
      const deployment = body?.success === true && Array.isArray(body?.result?.deployments)
        ? body.result.deployments[0] : null;
      const split = deploymentShape(deployment);
      if (response.status === 200 && split) {
        cloudflare = {
          status: "PROVIDER_READBACK",
          deployment_id: typeof deployment.id === "string" ? deployment.id : null,
          deployment_version_ids: split.map(row => row.version_id),
          traffic_split: split,
          single_version_at_100_percent: split.length === 1 && split[0].percentage === 100,
        };
      } else cloudflare = { ...cloudflare, status: "INVALID_PROVIDER_READBACK" };
    } catch { cloudflare = { ...cloudflare, status: "PROVIDER_UNAVAILABLE" }; }
  }

  const blockers = [];
  if (!workerHealthOk) blockers.push("CONTROL_PLANE_WORKER_HEALTH_NOT_VERIFIED");
  if (!predgeReadinessOk) blockers.push("PREDGE_PAID_OFF_READINESS_NOT_VERIFIED");
  if (workerHealthOk && h.deployed_source_sha !== expected)
    blockers.push("CONTROL_PLANE_WORKER_SOURCE_SHA_STALE");
  if (cloudflare.status !== "PROVIDER_READBACK") blockers.push("CLOUDFLARE_DEPLOYMENT_READBACK_UNAVAILABLE");
  if (cloudflare.status === "PROVIDER_READBACK" && !cloudflare.single_version_at_100_percent)
    blockers.push("CONTROL_PLANE_WORKER_SPLIT_NOT_SINGLE_BASELINE");

  return {
    schema: "geomacro.predge-worker-deployment-no-funds.v1",
    checked_at: now.toISOString(),
    expected_source_sha: expected,
    deployed_source_sha: workerHealthOk ? h.deployed_source_sha : null,
    worker_health_http_status: health.status,
    worker_health_ok: workerHealthOk,
    worker_schema_version: workerHealthOk ? h.schema_version : null,
    predge_readiness_http_status: readiness.status,
    predge_readiness_status: typeof r?.status === "string" ? r.status : null,
    predge_checks: r?.checks && typeof r.checks === "object" ? {
      database: r.checks.database === true,
      audit_store: r.checks.audit_store === true,
      isolated_partner_credential: r.checks.isolated_partner_credential === true,
      active_pinned_verification_key: r.checks.active_pinned_verification_key === true,
      fresh_verified_commercial_country_gro: r.checks.fresh_verified_commercial_country_gro === true,
      progressive_decision_ed25519_signer_configured:
        r.checks.progressive_decision_ed25519_signer_configured === true,
    } : null,
    predge_paid_launch_approved: r?.paid_launch_approved === true,
    execution_authorized: r?.execution_authorized === true,
    cloudflare,
    status: blockers.length ? "HOLD" : "PASS",
    blockers,
    traffic_changed: false,
    d1_writes: 0,
    payments: 0,
    commercial_release_activated: false,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await auditPredgeWorkerDeployment();
    console.log(JSON.stringify(result));
    if (result.status === "HOLD") console.log(`::notice::PREDGE_WORKER_DEPLOYMENT_HOLD ${result.blockers.join(",")}`);
  } catch (error) {
    const code = /^PREDGE_WORKER_[A-Z0-9_]+$/u.test(String(error?.message ?? ""))
      ? error.message : "PREDGE_WORKER_AUDIT_FAILED";
    console.error(JSON.stringify({ status: "HOLD", code, traffic_changed: false, payments: 0 }));
    process.exitCode = 2;
  }
}
