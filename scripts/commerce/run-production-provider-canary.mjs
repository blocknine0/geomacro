import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  assertAdaptiveProduct,
  assertAvailability,
  canaryContext,
  centsToAtomic,
  decodeBase64Json,
  fail,
  productionAdaptiveRequest,
  required,
  verifyCanaryBuild,
  writeEvidence,
} from "./production-canary-common.mjs";

const ACK = "I_AUTHORIZE_ONE_CAPPED_INTERNAL_REAL_MONEY_CANARY";
const PROVIDER_ACKS = {
  coinbase: "I_AUTHORIZE_COINBASE_CAPPED_CANARY",
  circle: "I_AUTHORIZE_CIRCLE_CAPPED_CANARY",
  nevermined: "I_AUTHORIZE_NEVERMINED_CAPPED_CANARY",
};
const PATHS = {
  coinbase: "/api/x402/intelligence",
  circle: "/api/x402/circle/intelligence",
  nevermined: "/api/x402/nevermined/intelligence",
};
const EVIDENCE_PROVIDERS = {
  coinbase: "coinbase_cdp_x402",
  circle: "circle_gateway_x402",
  nevermined: "nevermined_x402",
};
const BASE_MAINNET = "eip155:8453";
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const HARD_MAX_USDC_ATOMIC = 50_000n;

function sha256(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function exactAck(provider) {
  if (required("GEOMACRO_REAL_MONEY_CANARY_ACK") !== ACK) {
    fail(`GEOMACRO_REAL_MONEY_CANARY_ACK must equal ${ACK}`);
  }
  if (required("GEOMACRO_PRODUCTION_CANARY_PROVIDER_ACK") !== PROVIDER_ACKS[provider]) {
    fail(`Provider acknowledgement must equal ${PROVIDER_ACKS[provider]}`);
  }
}

function challengeFrom(response, body) {
  const header = response.headers.get("PAYMENT-REQUIRED");
  if (!header) fail("Production canary 402 is missing PAYMENT-REQUIRED");
  const decoded = decodeBase64Json(header);
  if (!decoded || decoded.x402Version !== 2) fail("Production canary PAYMENT-REQUIRED is not x402 v2");
  if (JSON.stringify(decoded) !== JSON.stringify(body)) {
    fail("Production canary PAYMENT-REQUIRED header/body mismatch");
  }
  if (!Array.isArray(decoded.accepts) || decoded.accepts.length !== 1) {
    fail("Production canary requires exactly one accepted payment requirement");
  }
  return decoded;
}

function settlementReference(body, headerValue) {
  const fromBody = String(body?.payment?.settlement_reference ?? "").trim();
  if (fromBody) return fromBody;
  const decoded = decodeBase64Json(headerValue);
  for (const value of [
    decoded?.settlement_reference,
    decoded?.transaction,
    decoded?.transactionHash,
    decoded?.txHash,
    decoded?.tx_hash,
  ]) {
    const normalized = String(value ?? "").trim();
    if (normalized) return normalized;
  }
  return "";
}

function assertProductHashes(body, label) {
  assertAdaptiveProduct(body, label);
  return {
    queryPlanHash: String(body.query_plan_hash).toLowerCase(),
    deliveredProductHash: String(body.delivered_product_hash).toLowerCase(),
  };
}

function requireUsdcCap(challenge) {
  const maxAtomic = centsToAtomic(required("GEOMACRO_PRODUCTION_CANARY_MAX_USDC"));
  if (maxAtomic <= 0n || maxAtomic > HARD_MAX_USDC_ATOMIC) {
    fail("GEOMACRO_PRODUCTION_CANARY_MAX_USDC must be > 0 and <= 0.05 USDC");
  }
  const requirement = challenge.accepts[0];
  if (requirement.scheme !== "exact" || requirement.network !== BASE_MAINNET) {
    fail("Production canary payment requirement is not exact Base mainnet");
  }
  if (String(requirement.asset ?? "").toLowerCase() !== BASE_USDC.toLowerCase()) {
    fail("Production canary payment requirement is not canonical Base USDC");
  }
  const amount = BigInt(String(requirement.amount ?? "0"));
  if (amount <= 0n || amount > maxAtomic) {
    fail(`Production canary amount ${amount} exceeds configured cap ${maxAtomic}`);
  }
  return { requirement, amount, maxAtomic };
}

async function postJson(url, serializedBody, paymentSignature = "") {
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (paymentSignature) headers["PAYMENT-SIGNATURE"] = paymentSignature;
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: serializedBody,
    redirect: "error",
    signal: AbortSignal.timeout(90_000),
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    fail(`Production canary endpoint returned non-JSON HTTP ${response.status}`);
  }
  return { response, body };
}

async function coinbasePayment(challenge, serializedBody, endpoint) {
  const { x402Client, x402HTTPClient } = await import("@x402/core/client");
  const { ExactEvmScheme } = await import("@x402/evm/exact/client");
  const { Contract, JsonRpcProvider, Wallet, getAddress } = await import("ethers");

  const privateKey = required("GEOMACRO_COINBASE_PRODUCTION_CANARY_BUYER_PRIVATE_KEY");
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) fail("Coinbase canary buyer private key format is invalid");
  const rpcUrl = required("GEOMACRO_COINBASE_MAINNET_RPC_URL");
  const rpc = new URL(rpcUrl);
  if (rpc.protocol !== "https:") fail("Coinbase Base-mainnet RPC must use HTTPS");

  const { amount } = requireUsdcCap(challenge);
  const wallet = new Wallet(privateKey);
  const payer = getAddress(wallet.address);
  const core = new x402Client();
  core.register(BASE_MAINNET, new ExactEvmScheme({
    address: payer,
    signTypedData: async ({ domain, types, message }) => wallet.signTypedData(domain, types, message),
  }));
  const http = new x402HTTPClient(core);
  const parsed = http.getPaymentRequiredResponse(() => null, challenge);
  const payload = await http.createPaymentPayload(parsed);
  const encoded = http.encodePaymentSignatureHeader(payload);
  const signature = encoded["PAYMENT-SIGNATURE"] || encoded["payment-signature"];
  if (!signature) fail("Coinbase canary could not create PAYMENT-SIGNATURE");

  const provider = new JsonRpcProvider(rpcUrl, 8453, { staticNetwork: true });
  if ((await provider.getNetwork()).chainId !== 8453n) fail("Coinbase canary RPC is not Base mainnet");
  const usdc = new Contract(
    BASE_USDC,
    ["function balanceOf(address) view returns (uint256)"],
    provider,
  );
  const before = BigInt(await usdc.balanceOf(payer));
  if (before < amount) fail("Coinbase canary buyer has insufficient Base USDC");

  const paid = await postJson(endpoint, serializedBody, signature);
  const afterPaid = BigInt(await usdc.balanceOf(payer));
  if (before - afterPaid !== amount) {
    fail(`Coinbase canary debit mismatch: expected=${amount} observed=${before - afterPaid}`);
  }

  return {
    paid,
    signature,
    afterPaid,
    assertReplayNoCharge: async () => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const afterReplay = BigInt(await usdc.balanceOf(payer));
      if (afterReplay !== afterPaid) fail("Coinbase replay changed buyer USDC balance");
    },
  };
}

async function circlePayment(challenge, serializedBody, endpoint) {
  requireUsdcCap(challenge);
  const privateKey = required("GEOMACRO_CIRCLE_PRODUCTION_CANARY_BUYER_PRIVATE_KEY");
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) fail("Circle canary buyer private key format is invalid");

  const { GatewayClient } = await import("@circle-fin/x402-batching/client");
  const { encodePaymentSignatureHeader } = await import("@x402/core/http");
  let capturedPayload = null;
  let capturedSettlement = null;
  const maxAtomic = centsToAtomic(required("GEOMACRO_PRODUCTION_CANARY_MAX_USDC"));
  const client = new GatewayClient({ chain: "base", privateKey });

  client.onBeforePaymentCreation(async (ctx) => {
    const selected = ctx?.selectedRequirements;
    if (!selected || selected.network !== BASE_MAINNET) {
      return { abort: true, reason: "Circle production canary requires Base mainnet" };
    }
    const amount = BigInt(String(selected.amount ?? "0"));
    if (amount <= 0n || amount > maxAtomic || amount > HARD_MAX_USDC_ATOMIC) {
      return { abort: true, reason: "Circle production canary amount exceeds cap" };
    }
  });
  client.onAfterPaymentCreation(async (ctx) => {
    capturedPayload = ctx?.paymentPayload ?? null;
  });
  client.onPaymentResponse(async (ctx) => {
    capturedSettlement = ctx?.settleResponse ?? null;
  });

  const result = await client.pay(endpoint.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: serializedBody,
  });
  if (!capturedPayload) fail("Circle canary did not expose the signed x402 payload to the lifecycle hook");

  const data = result?.data ?? result?.body ?? result;
  const status = Number(result?.status ?? 200);
  if (!data || typeof data !== "object") fail("Circle canary paid result has no JSON data");
  const signature = encodePaymentSignatureHeader(capturedPayload);
  return {
    paid: { response: { status, headers: new Headers() }, body: data },
    signature,
    capturedSettlement,
    assertReplayNoCharge: async () => {},
  };
}

async function neverminedPayment(challenge, serializedBody, endpoint) {
  const statusResponse = await fetch(endpoint, {
    method: "GET",
    headers: { Accept: "application/json", "Cache-Control": "no-cache" },
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  const statusText = await statusResponse.text();
  let statusBody;
  try { statusBody = JSON.parse(statusText); } catch { fail("Nevermined canary GET metadata is not JSON"); }
  if (statusResponse.status !== 200 || statusBody?.environment !== "live") {
    fail("Nevermined canary endpoint is not live production");
  }
  const maxApproved = BigInt(required("GEOMACRO_NEVERMINED_CANARY_MAX_AMOUNT"));
  const advertisedMax = BigInt(String(statusBody?.max_amount ?? "0"));
  if (maxApproved <= 0n || advertisedMax <= 0n || advertisedMax > maxApproved) {
    fail("Nevermined live plan maximum exceeds the owner-approved canary cap");
  }
  const requirement = challenge.accepts[0];
  if (!String(requirement?.network ?? "").trim() || !String(requirement?.planId ?? "").trim()) {
    fail("Nevermined production challenge is missing network/plan binding");
  }
  const signature = required("GEOMACRO_NEVERMINED_PRODUCTION_CANARY_PAYMENT_SIGNATURE");
  if (Buffer.byteLength(signature, "utf8") > 64 * 1024) fail("Nevermined canary payment signature is too large");
  const paid = await postJson(endpoint, serializedBody, signature);
  return { paid, signature, assertReplayNoCharge: async () => {} };
}

async function main() {
  const provider = required("GEOMACRO_PRODUCTION_CANARY_PROVIDER").toLowerCase();
  if (!Object.hasOwn(PATHS, provider)) fail("GEOMACRO_PRODUCTION_CANARY_PROVIDER must be coinbase, circle or nevermined");
  exactAck(provider);

  const context = canaryContext();
  await verifyCanaryBuild(context);
  const endpoint = new URL(PATHS[provider], context.base);
  const { request, clientRequestId } = productionAdaptiveRequest(`${provider}-production-canary`);
  const serializedBody = JSON.stringify(request);

  const availability = await assertAvailability(
    context.base,
    serializedBody,
    provider === "coinbase" ? "coinbase_cdp_x402" : provider === "circle" ? "circle_gateway_x402" : "nevermined",
  );
  const availabilityPlanHash = String(availability.body?.query_plan_hash ?? "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(availabilityPlanHash)) fail("Production canary availability lacks query_plan_hash");

  const unpaid = await postJson(endpoint, serializedBody);
  if (unpaid.response.status !== 402) fail(`Production canary expected HTTP 402, got ${unpaid.response.status}`);
  const challenge = challengeFrom(unpaid.response, unpaid.body);
  if (provider !== "nevermined") requireUsdcCap(challenge);

  const payment = provider === "coinbase"
    ? await coinbasePayment(challenge, serializedBody, endpoint)
    : provider === "circle"
      ? await circlePayment(challenge, serializedBody, endpoint)
      : await neverminedPayment(challenge, serializedBody, endpoint);

  if (payment.paid.response.status !== 200) {
    fail(`Production canary paid request failed with HTTP ${payment.paid.response.status}`);
  }
  const hashes = assertProductHashes(payment.paid.body, "Production canary paid response");
  if (hashes.queryPlanHash !== availabilityPlanHash) {
    fail("Production canary delivered query plan differs from pre-payment availability");
  }

  let paidSettlement = settlementReference(
    payment.paid.body,
    payment.paid.response.headers?.get?.("PAYMENT-RESPONSE") ?? "",
  );
  if (!paidSettlement && provider === "circle") {
    paidSettlement = String(
      payment.capturedSettlement?.settlement_reference ??
      payment.capturedSettlement?.transaction ??
      "",
    ).trim();
  }
  if (!paidSettlement) fail("Production canary paid response is missing settlement reference");

  const replay = await postJson(endpoint, serializedBody, payment.signature);
  if (replay.response.status !== 200) fail(`Production canary replay failed with HTTP ${replay.response.status}`);
  const replayHashes = assertProductHashes(replay.body, "Production canary replay");
  if (
    replayHashes.queryPlanHash !== hashes.queryPlanHash ||
    replayHashes.deliveredProductHash !== hashes.deliveredProductHash
  ) {
    fail("Production canary replay returned different intelligence");
  }
  if (replay.body?.payment?.idempotent_replay !== true) {
    fail("Production canary replay is not explicitly marked idempotent");
  }
  const replaySettlement = settlementReference(
    replay.body,
    replay.response.headers.get("PAYMENT-RESPONSE") ?? "",
  );
  if (!replaySettlement) {
    fail("Production canary replay is missing the durable settlement reference");
  }
  if (replaySettlement !== paidSettlement) {
    fail("Production canary replay returned a different settlement reference");
  }
  await payment.assertReplayNoCharge();

  const changed = structuredClone(request);
  changed.client_request_id = clientRequestId;
  changed.question = `${request.question} [changed replay must fail]`;
  const conflict = await postJson(endpoint, JSON.stringify(changed), payment.signature);
  if (![400, 402, 409].includes(conflict.response.status)) {
    fail(`Changed-request replay did not fail closed: HTTP ${conflict.response.status}`);
  }

  const evidenceProvider = EVIDENCE_PROVIDERS[provider];
  const evidence = {
    schema_version: "geomacro.production-provider-canary.v1",
    generated_at: new Date().toISOString(),
    canonical_sha: context.expectedSha,
    provider: evidenceProvider,
    canary_host: context.expectedHost,
    public_production_host_used: false,
    client_request_id_sha256: sha256(clientRequestId),
    paid_status: payment.paid.response.status,
    replay_status: replay.response.status,
    settlement_proven: true,
    settlement_reference_sha256: sha256(paidSettlement),
    query_plan_hash: hashes.queryPlanHash,
    delivered_product_hash: hashes.deliveredProductHash,
    replay_no_second_charge: true,
    replay_same_settlement_reference: true,
    zero_second_charge_proof: {
      server_idempotent_replay: true,
      same_settlement_reference: true,
      buyer_balance_check_performed: provider === "coinbase",
      buyer_balance_unchanged_after_replay: provider === "coinbase" ? true : null,
      reconciliation_single_payment_event_required: true,
    },
    changed_request_replay_failed_closed: true,
    execution_authorized: false,
    internal_canary: true,
    purchase_classification: "internal_canary",
    commercial_revenue: false,
    private_key_persisted: false,
    raw_payment_proof_persisted: false,
    raw_settlement_reference_persisted_in_public_evidence: false,
    real_money_canary_performed: true,
    public_launch_authorized_by_this_artifact: false,
  };

  const handoff = {
    schema_version: "geomacro.production-provider-canary-private-handoff.v1",
    generated_at: evidence.generated_at,
    canonical_sha: context.expectedSha,
    provider: evidenceProvider,
    settlement_reference: paidSettlement,
    settlement_reference_sha256: evidence.settlement_reference_sha256,
    delivered_product_hash: hashes.deliveredProductHash,
    query_plan_hash: hashes.queryPlanHash,
    client_request_id_sha256: evidence.client_request_id_sha256,
    payment_signature_included: false,
    private_key_included: false,
    internal_canary: true,
    purchase_classification: "internal_canary",
  };

  await writeEvidence({ provider, evidence, handoff });
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
