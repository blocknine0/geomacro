import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { Contract, JsonRpcProvider, Wallet, getAddress, isAddress } from "ethers";

const RESOURCE_URL = "https://geomacro.live/api/x402/intelligence";
const AVAILABILITY_URL = "https://geomacro.live/api/x402/risk/availability";
const EXPECTED_NETWORK = "eip155:84532";
const EXPECTED_ASSET = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const EXPECTED_PRODUCT = "geomacro_adaptive_risk_intelligence_v1";
const EXPECTED_AMOUNT_ATOMIC = 50_000n; // historical Base Sepolia acceptance price: 0.05 test USDC
const ACK = "COINBASE_X402_ADAPTIVE_BASE_SEPOLIA_USDC";
const RPC_URL = process.env.GEOMACRO_COINBASE_X402_BASE_SEPOLIA_RPC || "https://sepolia.base.org";
const PRIVATE_KEY = process.env.GEOMACRO_COINBASE_X402_BUYER_PRIVATE_KEY || "";
const EXPECTED_BUYER = process.env.GEOMACRO_COINBASE_X402_BUYER_ADDRESS || "";
const ARTIFACT_DIR = process.env.GEOMACRO_COINBASE_X402_ADAPTIVE_E2E_ARTIFACT_DIR || "artifacts/coinbase-x402-adaptive-base-sepolia-paid";

const USDC_ABI = ["function balanceOf(address account) view returns (uint256)"];

function fail(message) { throw new Error(message); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }

function requireAck() {
  if (process.env.GEOMACRO_COINBASE_X402_ADAPTIVE_E2E_ACK !== ACK) {
    fail(`Refusing adaptive paid E2E without exact acknowledgement ${ACK}`);
  }
}

function requirePrivateKey() {
  if (!/^0x[0-9a-fA-F]{64}$/.test(PRIVATE_KEY)) {
    fail("GEOMACRO_COINBASE_X402_BUYER_PRIVATE_KEY must be a 32-byte 0x-prefixed Base Sepolia test-wallet private key");
  }
}

function normalizeAddress(value, label) {
  if (typeof value !== "string" || !isAddress(value)) fail(`${label} is not a valid EVM address`);
  return getAddress(value);
}

function decodeBase64Json(value) {
  if (!value) return null;
  try { return JSON.parse(Buffer.from(value, "base64").toString("utf8")); } catch { return null; }
}

function encodeBase64Json(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function extractSettlementTx(settlement) {
  if (!settlement || typeof settlement !== "object") return null;
  for (const value of [settlement.transaction, settlement.transactionHash, settlement.txHash, settlement.tx_hash]) {
    if (typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value)) return value;
  }
  return null;
}

async function readJson(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { fail(`Expected JSON from ${response.url}, got: ${text.slice(0, 300)}`); }
}

function assertExecutionBoundary(body, label) {
  if (!body || typeof body !== "object") fail(`${label} did not return a JSON object`);
  if (body.execution_authorized !== false) fail(`${label} must set execution_authorized=false`);
}

function assertAdaptiveProduct(body) {
  assertExecutionBoundary(body, "Adaptive paid response");
  if (body.product !== EXPECTED_PRODUCT) fail(`Unexpected adaptive product: ${body.product}`);
  if (typeof body.query_plan_hash !== "string" || !/^[0-9a-f]{64}$/.test(body.query_plan_hash)) fail("Adaptive response is missing a valid query_plan_hash");
  if (typeof body.delivered_product_hash !== "string" || !/^[0-9a-f]{64}$/.test(body.delivered_product_hash)) fail("Adaptive response is missing delivered_product_hash");
  if (!Array.isArray(body.signed_risk_objects) || body.signed_risk_objects.length < 1) fail("Adaptive response did not deliver a signed Risk Object");
  if (!Array.isArray(body.risk_gate) || body.risk_gate.length < 1) fail("Adaptive response did not deliver Risk Gate output");
  for (const row of body.risk_gate) {
    if (row?.result?.context?.execution_authorized !== false || row?.result?.response?.execution_authorized !== false) {
      fail("Risk Gate execution boundary was violated");
    }
  }
}

function adaptiveRequest(clientRequestId, amountUsdc = 1000) {
  return {
    schema_version: "geomacro.agent-query.v1",
    question: "Should a treasury payment involving the United States proceed based on the current Geomacro Risk Gate?",
    subjects: [{ type: "country", country_iso3: "USA" }],
    topics: ["risk_object", "risk_gate"],
    evidence: "required",
    detail: "standard",
    risk_gate_context: {
      policy_preset: "balanced",
      action_type: "treasury_payment",
      amount_usdc: amountUsdc,
    },
    client_request_id: clientRequestId,
  };
}

async function assertNoDebit(usdc, payer, before, label) {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const after = BigInt(await usdc.balanceOf(payer));
  if (after !== before) fail(`${label} changed buyer USDC balance: before=${before}, after=${after}`);
  return after;
}

async function main() {
  requireAck();
  requirePrivateKey();

  for (const [url, pathname] of [[RESOURCE_URL, "/api/x402/intelligence"], [AVAILABILITY_URL, "/api/x402/risk/availability"]]) {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== "geomacro.live" || parsed.pathname !== pathname) {
      fail(`Pinned Geomacro HTTPS endpoint mismatch: ${url}`);
    }
  }

  const wallet = new Wallet(PRIVATE_KEY);
  const payer = normalizeAddress(wallet.address, "Derived buyer address");
  if (EXPECTED_BUYER && normalizeAddress(EXPECTED_BUYER, "Expected buyer address") !== payer) {
    fail("Configured expected buyer address does not match the private key");
  }

  const signer = {
    address: payer,
    signTypedData: async ({ domain, types, message }) => wallet.signTypedData(domain, types, message),
  };
  const core = new x402Client();
  core.register(EXPECTED_NETWORK, new ExactEvmScheme(signer));
  const httpClient = new x402HTTPClient(core);

  const clientRequestId = process.env.GEOMACRO_COINBASE_X402_CLIENT_REQUEST_ID || `adaptive-x402-${randomUUID()}`;
  const requestBody = adaptiveRequest(clientRequestId);
  const serializedBody = JSON.stringify(requestBody);
  const baseHeaders = { "Content-Type": "application/json", Accept: "application/json" };

  // 1. No-charge deliverability check must pass and disclose the exact testnet price.
  const availabilityResponse = await fetch(AVAILABILITY_URL, { method: "POST", headers: baseHeaders, body: serializedBody, redirect: "error" });
  const availabilityBody = await readJson(availabilityResponse);
  if (availabilityResponse.status !== 200 || availabilityBody?.ok !== true || availabilityBody?.chargeable !== true) {
    fail(`No-charge availability check did not pass: HTTP ${availabilityResponse.status}`);
  }
  if (availabilityBody?.payment_required_now !== false) fail("Availability endpoint unexpectedly requires payment");
  if (BigInt(availabilityBody?.exact_price?.amount_atomic ?? "0") !== EXPECTED_AMOUNT_ATOMIC) fail("Availability endpoint returned unexpected Base Sepolia price");
  const availabilityPlanHash = availabilityBody?.query_plan_hash;
  if (typeof availabilityPlanHash !== "string" || !/^[0-9a-f]{64}$/.test(availabilityPlanHash)) fail("Availability endpoint is missing a valid query_plan_hash");

  // 2. The same deliverable request must now receive a standards-shaped HTTP 402.
  const initial = await fetch(RESOURCE_URL, { method: "POST", headers: baseHeaders, body: serializedBody, redirect: "error" });
  if (initial.status !== 402) fail(`Expected initial adaptive HTTP 402, received ${initial.status}`);
  const initialBody = await readJson(initial);
  const requiredHeader = initial.headers.get("PAYMENT-REQUIRED");
  if (!requiredHeader) fail("Adaptive 402 is missing PAYMENT-REQUIRED");
  const decodedRequired = decodeBase64Json(requiredHeader);
  if (!decodedRequired || decodedRequired.x402Version !== 2) fail("Adaptive PAYMENT-REQUIRED is not x402 v2");
  const geomacroInfo = decodedRequired?.extensions?.geomacro?.info;
  if (geomacroInfo?.product !== EXPECTED_PRODUCT || geomacroInfo?.query_plan_hash !== availabilityPlanHash) {
    fail("Adaptive PAYMENT-REQUIRED is not bound to the availability query plan");
  }

  const paymentRequired = httpClient.getPaymentRequiredResponse((name) => initial.headers.get(name), initialBody);
  if (!paymentRequired || paymentRequired.x402Version !== 2 || !Array.isArray(paymentRequired.accepts) || paymentRequired.accepts.length !== 1) {
    fail("x402 client could not parse the adaptive payment requirement");
  }
  const requirement = paymentRequired.accepts[0];
  if (requirement.scheme !== "exact" || requirement.network !== EXPECTED_NETWORK) fail("Adaptive payment requirement has unexpected scheme/network");
  if (normalizeAddress(requirement.asset, "Advertised asset") !== normalizeAddress(EXPECTED_ASSET, "Expected asset")) fail("Adaptive endpoint advertised the wrong USDC asset");
  const payTo = normalizeAddress(requirement.payTo, "Advertised payTo");
  const amountAtomic = BigInt(requirement.amount);
  if (amountAtomic !== EXPECTED_AMOUNT_ATOMIC) fail(`Adaptive endpoint advertised ${amountAtomic}, expected ${EXPECTED_AMOUNT_ATOMIC}`);

  const provider = new JsonRpcProvider(RPC_URL, 84532, { staticNetwork: true });
  if ((await provider.getNetwork()).chainId !== 84532n) fail("RPC is not Base Sepolia");
  const usdc = new Contract(EXPECTED_ASSET, USDC_ABI, provider);
  const beforeBalance = BigInt(await usdc.balanceOf(payer));
  if (beforeBalance < amountAtomic) fail(`Buyer has insufficient Base Sepolia USDC: ${beforeBalance}`);

  const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
  if (paymentPayload?.extensions?.geomacro?.info?.query_plan_hash !== availabilityPlanHash) {
    fail("x402 client did not echo the required Geomacro query-binding extension");
  }
  const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);
  const signatureHeader = paymentHeaders["PAYMENT-SIGNATURE"] || paymentHeaders["payment-signature"];
  if (!signatureHeader) fail("x402 client did not produce PAYMENT-SIGNATURE");

  // 3. One paid request only. No automatic retry after a signed authorization exists.
  const paid = await fetch(RESOURCE_URL, { method: "POST", headers: { ...baseHeaders, ...paymentHeaders }, body: serializedBody, redirect: "error" });
  const paidBody = await readJson(paid);
  if (paid.status !== 200) fail(`Adaptive paid request failed with HTTP ${paid.status}: ${JSON.stringify(paidBody).slice(0, 300)}`);
  assertAdaptiveProduct(paidBody);
  if (paidBody.query_plan_hash !== availabilityPlanHash) fail("Paid response query plan differs from no-charge availability plan");

  const settlement = httpClient.getPaymentSettleResponse((name) => paid.headers.get(name));
  const txHash = extractSettlementTx(settlement);
  if (!txHash) fail("Adaptive paid response is missing settlement transaction hash");
  const receipt = await provider.waitForTransaction(txHash, 1, 60_000);
  if (!receipt || receipt.status !== 1) fail(`Adaptive settlement did not confirm: ${txHash}`);
  const afterPaidBalance = BigInt(await usdc.balanceOf(payer));
  const observedDebit = beforeBalance - afterPaidBalance;
  if (observedDebit !== amountAtomic) fail(`Adaptive debit mismatch: observed=${observedDebit}, expected=${amountAtomic}`);

  // 4. Exact replay must return the cached product without a second debit.
  const replay = await fetch(RESOURCE_URL, { method: "POST", headers: { ...baseHeaders, ...paymentHeaders }, body: serializedBody, redirect: "error" });
  const replayBody = await readJson(replay);
  if (replay.status !== 200) fail(`Adaptive replay failed with HTTP ${replay.status}`);
  assertAdaptiveProduct(replayBody);
  if (replayBody?.payment?.idempotent_replay !== true) fail("Adaptive replay is not explicitly marked idempotent");
  const afterReplayBalance = await assertNoDebit(usdc, payer, afterPaidBalance, "Adaptive replay");

  // 5. Same signed proof with changed query terms must fail closed and not debit.
  const changedBody = JSON.stringify(adaptiveRequest(clientRequestId, 1001));
  const conflict = await fetch(RESOURCE_URL, { method: "POST", headers: { ...baseHeaders, ...paymentHeaders }, body: changedBody, redirect: "error" });
  const conflictBody = await readJson(conflict);
  if (![402, 409].includes(conflict.status)) fail(`Expected changed-query proof rejection, received HTTP ${conflict.status}`);
  if (!["X402_PAYMENT_BINDING_INVALID", "X402_PAYMENT_REPLAY_CONFLICT"].includes(conflictBody?.error?.code)) {
    fail(`Unexpected changed-query rejection code: ${conflictBody?.error?.code}`);
  }
  const afterConflictBalance = await assertNoDebit(usdc, payer, afterReplayBalance, "Changed-query replay");

  // 6. Tampered accepted amount (underpayment metadata) must be rejected before settlement.
  const tamperedPayload = structuredClone(paymentPayload);
  tamperedPayload.accepted = { ...tamperedPayload.accepted, amount: "1" };
  const tamperedHeader = encodeBase64Json(tamperedPayload);
  const underpayment = await fetch(RESOURCE_URL, {
    method: "POST",
    headers: { ...baseHeaders, "PAYMENT-SIGNATURE": tamperedHeader },
    body: serializedBody,
    redirect: "error",
  });
  const underpaymentBody = await readJson(underpayment);
  if (underpayment.status !== 402 || underpaymentBody?.error?.code !== "X402_PAYMENT_BINDING_INVALID") {
    fail(`Tampered underpayment metadata was not rejected safely: HTTP ${underpayment.status}`);
  }
  const afterUnderpaymentBalance = await assertNoDebit(usdc, payer, afterConflictBalance, "Underpayment rejection");

  const evidence = {
    schema_version: "coinbase-x402-adaptive-base-sepolia-paid-e2e-v1",
    generated_at: new Date().toISOString(),
    commercial_revenue: false,
    environment: "testnet",
    resource: RESOURCE_URL,
    availability_resource: AVAILABILITY_URL,
    product: EXPECTED_PRODUCT,
    network: EXPECTED_NETWORK,
    chain_id: 84532,
    asset: normalizeAddress(EXPECTED_ASSET, "Expected Base Sepolia USDC"),
    amount_atomic: amountAtomic.toString(),
    amount_usdc: Number(amountAtomic) / 1_000_000,
    payer,
    pay_to: payTo,
    client_request_id: clientRequestId,
    query_plan_hash: availabilityPlanHash,
    delivered_product_hash: paidBody.delivered_product_hash,
    initial_status: initial.status,
    availability_status: availabilityResponse.status,
    paid_status: paid.status,
    replay_status: replay.status,
    changed_query_status: conflict.status,
    underpayment_status: underpayment.status,
    settlement_tx_hash: txHash,
    settlement_block_number: receipt.blockNumber,
    settlement_status: "confirmed",
    observed_first_debit_atomic: observedDebit.toString(),
    replay_balance_delta_atomic: (afterPaidBalance - afterReplayBalance).toString(),
    changed_query_balance_delta_atomic: (afterReplayBalance - afterConflictBalance).toString(),
    underpayment_balance_delta_atomic: (afterConflictBalance - afterUnderpaymentBalance).toString(),
    duplicate_charge_count: 0,
    execution_authorized: false,
    payment_signature_persisted: false,
    private_key_persisted: false,
    request_body_sha256: sha256(serializedBody),
    acceptance: {
      no_charge_availability_passed: true,
      exact_price_disclosed_before_payment: true,
      initial_402: true,
      query_extension_echoed: true,
      paid_200: true,
      signed_risk_object_delivered: true,
      risk_gate_delivered: true,
      settlement_confirmed: true,
      exact_debit_matches_advertised_amount: true,
      replay_200: true,
      replay_no_second_debit: true,
      changed_query_same_proof_rejected: true,
      changed_query_no_debit: true,
      tampered_underpayment_rejected: true,
      underpayment_no_debit: true,
    },
  };

  await mkdir(ARTIFACT_DIR, { recursive: true });
  const artifactPath = path.join(ARTIFACT_DIR, `coinbase-x402-adaptive-base-sepolia-paid-${Date.now()}.json`);
  await writeFile(artifactPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.log("PASS: Coinbase x402 adaptive Base Sepolia paid E2E completed");
  console.log(`Settlement: ${txHash}`);
  console.log(`Evidence: ${artifactPath}`);
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
