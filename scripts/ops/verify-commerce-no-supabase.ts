#!/usr/bin/env bun
import { randomUUID } from "node:crypto";

const backend = String(process.env.GEOMACRO_COMMERCE_LEDGER_BACKEND ?? "").trim();
const ledgerUrl = String(process.env.GEOMACRO_COMMERCE_LEDGER_URL ?? "").trim().replace(/\/$/, "");
const ledgerToken = String(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN ?? "").trim();

if (backend !== "durable_object") throw new Error("NO_SUPABASE_ACCEPTANCE_REQUIRES_DURABLE_OBJECT");
if (!/^https:\/\//i.test(ledgerUrl) || ledgerToken.length < 32) {
  throw new Error("NO_SUPABASE_ACCEPTANCE_CONFIG_REQUIRED");
}

for (const key of [
  "APP_SUPABASE_URL",
  "APP_SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
]) {
  delete process.env[key];
}

const originalFetch = globalThis.fetch.bind(globalThis);
let supabaseFetchAttempts = 0;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const value = input instanceof Request ? input.url : String(input);
  let target: URL | null = null;
  try {
    target = new URL(value);
  } catch {
    target = null;
  }
  if (target?.hostname.endsWith(".supabase.co")) {
    supabaseFetchAttempts += 1;
    throw new Error("NO_SUPABASE_ACCEPTANCE_BLOCKED_SUPABASE_NETWORK");
  }
  return originalFetch(input, init);
}) as typeof fetch;

const {
  claimAgentCommerceDelivery,
  prepareAgentCommerceDelivery,
  completeAgentCommerceDelivery,
  releaseAgentCommerceDelivery,
  commerceSha256,
  commerceFingerprint,
  stableCommerceJson,
} = await import("../../src/lib/agent-commerce-delivery.server.ts");

const runId = randomUUID();
const provider = "coinbase_x402";
const providerEnvironment = "prelaunch-no-supabase";
const common = {
  provider,
  providerEnvironment,
  productId: "geomacro-no-supabase-acceptance",
  sourceChannel: "github-actions",
  rail: "synthetic",
  network: "none",
  asset: "USDC",
  amountAtomic: "50000",
  recipientReference: "synthetic-no-funds-recipient",
};

const paymentA = commerceSha256(`no-supabase-payment-a:${runId}`);
const requestA = commerceSha256(`no-supabase-request-a:${runId}`);
const claimA = await claimAgentCommerceDelivery({
  ...common,
  paymentFingerprint: paymentA,
  requestFingerprint: requestA,
  clientRequestId: `no-supabase-a-${runId}`,
});
if (claimA.disposition !== "CLAIMED" || !claimA.claim_token) {
  throw new Error("NO_SUPABASE_INITIAL_CLAIM_INVALID");
}

const conflict = await claimAgentCommerceDelivery({
  ...common,
  paymentFingerprint: paymentA,
  requestFingerprint: commerceSha256(`no-supabase-request-conflict:${runId}`),
  clientRequestId: `no-supabase-a-${runId}`,
});
if (conflict.disposition !== "CONFLICT") throw new Error("NO_SUPABASE_CONFLICT_NOT_ENFORCED");

const paymentConcurrent = commerceSha256(`no-supabase-payment-concurrent:${runId}`);
const requestConcurrent = commerceSha256(`no-supabase-request-concurrent:${runId}`);
const concurrent = await Promise.all(
  Array.from({ length: 5 }, (_, index) =>
    claimAgentCommerceDelivery({
      ...common,
      paymentFingerprint: paymentConcurrent,
      requestFingerprint: requestConcurrent,
      clientRequestId: `no-supabase-concurrent-${runId}-${index}`,
    }),
  ),
);
const concurrentDispositions = concurrent.map((item) => item.disposition);
if (
  concurrentDispositions.filter((item) => item === "CLAIMED").length !== 1 ||
  concurrentDispositions.some((item) => !["CLAIMED", "IN_PROGRESS"].includes(item))
) {
  throw new Error(`NO_SUPABASE_CONCURRENCY_INVALID:${concurrentDispositions.join(",")}`);
}

const responsePayload = {
  ok: true,
  acceptance_run_id: runId,
  intelligence: { score: 42, synthetic: true, supabase_required: false },
};
const prepared = await prepareAgentCommerceDelivery({
  provider,
  providerEnvironment,
  paymentFingerprint: paymentA,
  claimToken: claimA.claim_token,
  responsePayload,
});
if (prepared.responseSha256 !== commerceFingerprint(responsePayload)) {
  throw new Error("NO_SUPABASE_PREPARE_HASH_INVALID");
}

const settlementReference = `no-supabase:${runId}`;
await completeAgentCommerceDelivery({
  provider,
  providerEnvironment,
  paymentFingerprint: paymentA,
  claimToken: claimA.claim_token,
  payerReference: `synthetic-payer-${runId}`,
  settlementReference,
  settlementNetwork: "synthetic-prelaunch",
});

const replay = await claimAgentCommerceDelivery({
  ...common,
  paymentFingerprint: paymentA,
  requestFingerprint: requestA,
  clientRequestId: `no-supabase-a-${runId}`,
});
if (
  replay.disposition !== "REPLAY" ||
  replay.response_sha256 !== prepared.responseSha256 ||
  replay.settlement_reference !== settlementReference ||
  stableCommerceJson(replay.response_payload) !== stableCommerceJson(responsePayload)
) {
  throw new Error("NO_SUPABASE_REPLAY_INVALID");
}

const paymentDuplicate = commerceSha256(`no-supabase-payment-duplicate:${runId}`);
const requestDuplicate = commerceSha256(`no-supabase-request-duplicate:${runId}`);
const duplicateClaim = await claimAgentCommerceDelivery({
  ...common,
  paymentFingerprint: paymentDuplicate,
  requestFingerprint: requestDuplicate,
  clientRequestId: `no-supabase-duplicate-${runId}`,
});
if (duplicateClaim.disposition !== "CLAIMED" || !duplicateClaim.claim_token) {
  throw new Error("NO_SUPABASE_DUPLICATE_CLAIM_INVALID");
}
await prepareAgentCommerceDelivery({
  provider,
  providerEnvironment,
  paymentFingerprint: paymentDuplicate,
  claimToken: duplicateClaim.claim_token,
  responsePayload: { ok: true, duplicate_settlement_probe: true, runId },
});
let duplicateRejected = false;
try {
  await completeAgentCommerceDelivery({
    provider,
    providerEnvironment,
    paymentFingerprint: paymentDuplicate,
    claimToken: duplicateClaim.claim_token,
    payerReference: `synthetic-payer-duplicate-${runId}`,
    settlementReference,
    settlementNetwork: "synthetic-prelaunch",
  });
} catch (error) {
  duplicateRejected = error instanceof Error && error.message === "AGENT_COMMERCE_DELIVERY_COMPLETE_LOST_CLAIM";
}
if (!duplicateRejected) throw new Error("NO_SUPABASE_DUPLICATE_SETTLEMENT_NOT_REJECTED");

const paymentRelease = commerceSha256(`no-supabase-payment-release:${runId}`);
const requestRelease = commerceSha256(`no-supabase-request-release:${runId}`);
const releaseClaim = await claimAgentCommerceDelivery({
  ...common,
  paymentFingerprint: paymentRelease,
  requestFingerprint: requestRelease,
  clientRequestId: `no-supabase-release-${runId}`,
});
if (releaseClaim.disposition !== "CLAIMED" || !releaseClaim.claim_token) {
  throw new Error("NO_SUPABASE_RELEASE_CLAIM_INVALID");
}
await releaseAgentCommerceDelivery({
  provider,
  providerEnvironment,
  paymentFingerprint: paymentRelease,
  claimToken: releaseClaim.claim_token,
  failureCode: "SYNTHETIC_PRE_SETTLEMENT_FAILURE",
  manualReview: false,
});
const reclaimed = await claimAgentCommerceDelivery({
  ...common,
  paymentFingerprint: paymentRelease,
  requestFingerprint: requestRelease,
  clientRequestId: `no-supabase-release-${runId}`,
});
if (reclaimed.disposition !== "CLAIMED" || !reclaimed.claim_token) {
  throw new Error("NO_SUPABASE_RECLAIM_INVALID");
}

const liveLedgerUrl = process.env.GEOMACRO_COMMERCE_LEDGER_URL;
process.env.GEOMACRO_COMMERCE_LEDGER_URL = "https://geomacro-ledger-outage.invalid";
let outageFailedClosed = false;
try {
  await claimAgentCommerceDelivery({
    ...common,
    paymentFingerprint: commerceSha256(`no-supabase-outage-payment:${runId}`),
    requestFingerprint: commerceSha256(`no-supabase-outage-request:${runId}`),
    clientRequestId: `no-supabase-outage-${runId}`,
  });
} catch {
  outageFailedClosed = true;
} finally {
  if (liveLedgerUrl) process.env.GEOMACRO_COMMERCE_LEDGER_URL = liveLedgerUrl;
}
if (!outageFailedClosed) throw new Error("NO_SUPABASE_WORKER_OUTAGE_DID_NOT_FAIL_CLOSED");
if (supabaseFetchAttempts !== 0) throw new Error(`NO_SUPABASE_NETWORK_ATTEMPTED:${supabaseFetchAttempts}`);

console.log(JSON.stringify({
  ok: true,
  schema: "geomacro.no-supabase-commerce-acceptance.v1",
  backend: "durable_object",
  supabase_credentials_present: false,
  supabase_network_attempts: supabaseFetchAttempts,
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
  worker_outage_fails_closed: true,
  external_payment_performed: false,
  execution_authorized: false,
}));
