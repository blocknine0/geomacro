#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";

const baseUrl = String(process.env.GEOMACRO_COMMERCE_LEDGER_URL ?? "").trim().replace(/\/$/, "");
const token = String(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN ?? "").trim();
if (!/^https:\/\//i.test(baseUrl) || token.length < 32) {
  throw new Error("COMMERCE_LEDGER_ACCEPTANCE_CONFIG_REQUIRED");
}

const sha256 = (value) => createHash("sha256").update(String(value), "utf8").digest("hex");
const scope = {
  provider: "acceptance",
  providerEnvironment: "prelaunch",
  productId: "geomacro-ledger-acceptance",
  sourceChannel: "github-actions",
  rail: "synthetic",
  network: "none",
  asset: "USDC",
  amountAtomic: "50000",
  recipientHash: sha256("geomacro-acceptance-recipient"),
};

async function post(action, body) {
  const response = await fetch(`${baseUrl}/v1/delivery/${action}`, {
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
    throw new Error(`LEDGER_${action.toUpperCase()}_HTTP_${response.status}`);
  }
  return payload;
}

const health = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(10_000) });
const healthPayload = await health.json().catch(() => null);
if (
  !health.ok ||
  healthPayload?.ok !== true ||
  healthPayload?.service !== "geomacro-commerce-ledger" ||
  healthPayload?.storage !== "durable_objects_sqlite"
) {
  throw new Error("COMMERCE_LEDGER_HEALTH_INVALID");
}

const runId = randomUUID();
const paymentA = sha256(`payment-a:${runId}`);
const requestA = sha256(`request-a:${runId}`);
const clientRequestA = `acceptance-${runId}`;

const claimA = await post("claim", {
  paymentFingerprint: paymentA,
  requestFingerprint: requestA,
  clientRequestId: clientRequestA,
});
if (claimA.disposition !== "CLAIMED" || !claimA.claim_token) {
  throw new Error("COMMERCE_LEDGER_INITIAL_CLAIM_INVALID");
}

const conflict = await post("claim", {
  paymentFingerprint: paymentA,
  requestFingerprint: sha256(`request-conflict:${runId}`),
  clientRequestId: clientRequestA,
});
if (conflict.disposition !== "CONFLICT") {
  throw new Error("COMMERCE_LEDGER_CONFLICT_NOT_ENFORCED");
}

const paymentConcurrent = sha256(`payment-concurrent:${runId}`);
const requestConcurrent = sha256(`request-concurrent:${runId}`);
const concurrentResults = await Promise.all(
  Array.from({ length: 5 }, (_, index) =>
    post("claim", {
      paymentFingerprint: paymentConcurrent,
      requestFingerprint: requestConcurrent,
      clientRequestId: `concurrent-${runId}-${index}`,
    }),
  ),
);
const concurrentDispositions = concurrentResults.map((item) => item.disposition);
if (
  concurrentDispositions.filter((item) => item === "CLAIMED").length !== 1 ||
  concurrentDispositions.some((item) => !["CLAIMED", "IN_PROGRESS"].includes(item))
) {
  throw new Error(`COMMERCE_LEDGER_CONCURRENT_CLAIM_INVALID:${concurrentDispositions.join(",")}`);
}

const responsePayload = {
  ok: true,
  acceptance_run_id: runId,
  intelligence: { score: 42, synthetic: true },
};
const responseSha256 = sha256(JSON.stringify(responsePayload));
const prepared = await post("prepare", {
  paymentFingerprint: paymentA,
  claimToken: claimA.claim_token,
  responsePayload,
  responseSha256,
});
if (prepared.ok !== true) {
  throw new Error("COMMERCE_LEDGER_PREPARE_INVALID");
}

const settlementReference = `acceptance:${runId}`;
const completed = await post("complete", {
  paymentFingerprint: paymentA,
  claimToken: claimA.claim_token,
  payerHash: sha256(`payer:${runId}`),
  settlementReference,
  settlementNetwork: "synthetic-prelaunch",
});
if (completed.ok !== true) {
  throw new Error("COMMERCE_LEDGER_COMPLETE_INVALID");
}

const replay = await post("claim", {
  paymentFingerprint: paymentA,
  requestFingerprint: requestA,
  clientRequestId: clientRequestA,
});
if (
  replay.disposition !== "REPLAY" ||
  replay.response_sha256 !== responseSha256 ||
  JSON.stringify(replay.response_payload) !== JSON.stringify(responsePayload) ||
  replay.settlement_reference !== settlementReference
) {
  throw new Error("COMMERCE_LEDGER_REPLAY_INVALID");
}

const paymentB = sha256(`payment-b:${runId}`);
const requestB = sha256(`request-b:${runId}`);
const claimB = await post("claim", {
  paymentFingerprint: paymentB,
  requestFingerprint: requestB,
  clientRequestId: `acceptance-b-${runId}`,
});
if (claimB.disposition !== "CLAIMED" || !claimB.claim_token) {
  throw new Error("COMMERCE_LEDGER_SECOND_CLAIM_INVALID");
}
const responseB = { ok: true, acceptance_run_id: runId, duplicate_settlement_probe: true };
const prepareB = await post("prepare", {
  paymentFingerprint: paymentB,
  claimToken: claimB.claim_token,
  responsePayload: responseB,
  responseSha256: sha256(JSON.stringify(responseB)),
});
if (prepareB.ok !== true) throw new Error("COMMERCE_LEDGER_SECOND_PREPARE_INVALID");
const duplicateSettlement = await post("complete", {
  paymentFingerprint: paymentB,
  claimToken: claimB.claim_token,
  payerHash: sha256(`payer-b:${runId}`),
  settlementReference,
  settlementNetwork: "synthetic-prelaunch",
});
if (duplicateSettlement.ok !== false) {
  throw new Error("COMMERCE_LEDGER_DUPLICATE_SETTLEMENT_NOT_REJECTED");
}

const paymentC = sha256(`payment-c:${runId}`);
const requestC = sha256(`request-c:${runId}`);
const claimC = await post("claim", {
  paymentFingerprint: paymentC,
  requestFingerprint: requestC,
  clientRequestId: `acceptance-c-${runId}`,
});
if (claimC.disposition !== "CLAIMED" || !claimC.claim_token) {
  throw new Error("COMMERCE_LEDGER_RELEASE_CLAIM_INVALID");
}
const released = await post("release", {
  paymentFingerprint: paymentC,
  claimToken: claimC.claim_token,
  failureCode: "SYNTHETIC_PRE_SETTLEMENT_FAILURE",
  manualReview: false,
});
if (released.ok !== true) throw new Error("COMMERCE_LEDGER_RELEASE_INVALID");
const reclaimed = await post("claim", {
  paymentFingerprint: paymentC,
  requestFingerprint: requestC,
  clientRequestId: `acceptance-c-${runId}`,
});
if (reclaimed.disposition !== "CLAIMED" || !reclaimed.claim_token) {
  throw new Error("COMMERCE_LEDGER_FAILED_RECLAIM_INVALID");
}

console.log(JSON.stringify({
  ok: true,
  schema: "geomacro.commerce-ledger-production-acceptance.v1",
  health: true,
  initial_claim: "CLAIMED",
  conflict: "CONFLICT",
  concurrent_claimed: concurrentDispositions.filter((item) => item === "CLAIMED").length,
  concurrent_in_progress: concurrentDispositions.filter((item) => item === "IN_PROGRESS").length,
  prepare: true,
  complete: true,
  replay: "REPLAY",
  exact_response_replay: true,
  duplicate_settlement_rejected: true,
  failed_claim_reclaim: true,
  external_payment_performed: false,
  execution_authorized: false,
}));
