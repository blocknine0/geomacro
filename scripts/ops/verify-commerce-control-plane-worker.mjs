#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";

const baseUrl = String(process.env.GEOMACRO_COMMERCE_LEDGER_URL ?? "").trim().replace(/\/$/, "");
const token = String(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN ?? "").trim();
if (!/^https:\/\//i.test(baseUrl) || token.length < 32) {
  throw new Error("COMMERCE_CONTROL_PLANE_ACCEPTANCE_CONFIG_REQUIRED");
}

const sha256 = (value) => createHash("sha256").update(String(value), "utf8").digest("hex");
const runId = randomUUID();
const scope = { provider: "acceptance", providerEnvironment: "prelaunch" };

async function post(section, action, body) {
  const response = await fetch(`${baseUrl}/v1/${section}/${action}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ ...scope, ...body }),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload !== "object") {
    throw new Error(`CONTROL_PLANE_${section.toUpperCase()}_${action.toUpperCase()}_HTTP_${response.status}`);
  }
  return payload;
}

const health = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(10_000) });
const healthPayload = await health.json().catch(() => null);
const capabilities = Array.isArray(healthPayload?.capabilities) ? healthPayload.capabilities : [];
if (
  !health.ok ||
  healthPayload?.ok !== true ||
  healthPayload?.service !== "geomacro-commerce-ledger" ||
  healthPayload?.storage !== "durable_objects_sqlite" ||
  !["delivery", "usage_guard", "product_audit"].every((value) => capabilities.includes(value))
) {
  throw new Error("COMMERCE_CONTROL_PLANE_HEALTH_INVALID");
}

const payerHash = sha256(`payer:${runId}`);
const paymentA = sha256(`usage-a:${runId}`);
const paymentB = sha256(`usage-b:${runId}`);
const paymentC = sha256(`usage-c:${runId}`);
const usageBase = {
  payerHash,
  amountAtomic: "50000",
  maxDailyAmountAtomic: "100000",
  maxDailyRequests: 10,
};

const reserveA = await post("usage", "reserve", { ...usageBase, paymentFingerprint: paymentA });
if (reserveA.disposition !== "RESERVED") throw new Error("CONTROL_PLANE_USAGE_RESERVE_A_INVALID");
const replayA = await post("usage", "reserve", { ...usageBase, paymentFingerprint: paymentA });
if (replayA.disposition !== "RESERVED") throw new Error("CONTROL_PLANE_USAGE_IDEMPOTENCY_INVALID");
const reserveB = await post("usage", "reserve", { ...usageBase, paymentFingerprint: paymentB });
if (reserveB.disposition !== "RESERVED") throw new Error("CONTROL_PLANE_USAGE_RESERVE_B_INVALID");
const blockedC = await post("usage", "reserve", { ...usageBase, paymentFingerprint: paymentC });
if (blockedC.disposition !== "SPEND_LIMIT") throw new Error("CONTROL_PLANE_USAGE_SPEND_LIMIT_NOT_ENFORCED");

const releaseB = await post("usage", "release", { paymentFingerprint: paymentB, manualReview: false });
if (releaseB.ok !== true) throw new Error("CONTROL_PLANE_USAGE_RELEASE_INVALID");
const reserveCAfterRelease = await post("usage", "reserve", { ...usageBase, paymentFingerprint: paymentC });
if (reserveCAfterRelease.disposition !== "RESERVED") throw new Error("CONTROL_PLANE_USAGE_RELEASE_DID_NOT_RESTORE_CAPACITY");
const finalizedC = await post("usage", "finalize", { paymentFingerprint: paymentC });
if (finalizedC.ok !== true) throw new Error("CONTROL_PLANE_USAGE_FINALIZE_INVALID");
const finalizedRelease = await post("usage", "release", { paymentFingerprint: paymentC, manualReview: false });
if (finalizedRelease.ok !== false) throw new Error("CONTROL_PLANE_FINALIZED_USAGE_WAS_RELEASED");

const auditFingerprint = sha256(`audit:${runId}`);
const queryPlanHash = sha256(`query:${runId}`);
const auditBase = {
  payment_fingerprint_sha256: auditFingerprint,
  query_plan_hash: queryPlanHash,
  product_id: "geomacro-control-plane-acceptance",
  status: "prepared",
  updated_at: new Date().toISOString(),
};
const auditPrepared = await post("audit", "upsert", {
  paymentFingerprint: auditFingerprint,
  audit: auditBase,
});
if (auditPrepared.ok !== true) throw new Error("CONTROL_PLANE_AUDIT_PREPARE_INVALID");
const auditDelivered = await post("audit", "upsert", {
  paymentFingerprint: auditFingerprint,
  audit: { ...auditBase, status: "delivered", delivered_at: new Date().toISOString() },
});
if (auditDelivered.ok !== true) throw new Error("CONTROL_PLANE_AUDIT_DELIVERED_INVALID");
const auditMutation = await post("audit", "upsert", {
  paymentFingerprint: auditFingerprint,
  audit: { ...auditBase, query_plan_hash: sha256(`other-query:${runId}`) },
});
if (auditMutation.ok !== false) throw new Error("CONTROL_PLANE_AUDIT_QUERY_BINDING_MUTABLE");

console.log(JSON.stringify({
  ok: true,
  schema: "geomacro.commerce-control-plane-production-acceptance.v1",
  health: true,
  capabilities,
  usage_reserve: true,
  usage_idempotent: true,
  spend_limit_enforced: true,
  release_restores_capacity: true,
  finalized_usage_irreversible: true,
  audit_upsert: true,
  audit_query_binding_immutable: true,
  external_payment_performed: false,
  execution_authorized: false,
}));
