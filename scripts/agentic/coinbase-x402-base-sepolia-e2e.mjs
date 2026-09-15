import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { Contract, JsonRpcProvider, Wallet, getAddress, isAddress } from "ethers";

const RESOURCE_URL = "https://geomacro.live/api/x402/risk";
const EXPECTED_NETWORK = "eip155:84532";
const EXPECTED_ASSET = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const MAX_PAYMENT_ATOMIC = 50_000n; // 0.05 USDC, hard testnet cap
const ACK = "COINBASE_X402_BASE_SEPOLIA_USDC";
const RPC_URL = process.env.GEOMACRO_COINBASE_X402_BASE_SEPOLIA_RPC || "https://sepolia.base.org";
const PRIVATE_KEY = process.env.GEOMACRO_COINBASE_X402_BUYER_PRIVATE_KEY || "";
const EXPECTED_BUYER = process.env.GEOMACRO_COINBASE_X402_BUYER_ADDRESS || "";
const ARTIFACT_DIR = process.env.GEOMACRO_COINBASE_X402_E2E_ARTIFACT_DIR || "artifacts/coinbase-x402-base-sepolia-paid";

const USDC_ABI = [
  "function balanceOf(address account) view returns (uint256)",
];

function fail(message) {
  throw new Error(message);
}

function requireTestnetAck() {
  if (process.env.GEOMACRO_COINBASE_X402_E2E_ACK !== ACK) {
    fail(`Refusing paid E2E without exact acknowledgement ${ACK}`);
  }
}

function requirePrivateKey() {
  if (!/^0x[0-9a-fA-F]{64}$/.test(PRIVATE_KEY)) {
    fail("GEOMACRO_COINBASE_X402_BUYER_PRIVATE_KEY must be a 32-byte 0x-prefixed EVM test-wallet private key");
  }
}

function normalizeAddress(value, label) {
  if (typeof value !== "string" || !isAddress(value)) {
    fail(`${label} is not a valid EVM address`);
  }
  return getAddress(value);
}

function decodeBase64Json(value) {
  if (!value) return null;
  try {
    return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function extractSettlementTx(settlement) {
  if (!settlement || typeof settlement !== "object") return null;
  const candidates = [
    settlement.transaction,
    settlement.transactionHash,
    settlement.txHash,
    settlement.tx_hash,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value)) return value;
  }
  return null;
}

function assertRiskBoundary(body, label) {
  if (!body || typeof body !== "object") fail(`${label} did not return a JSON object`);
  if (body?.risk_gate?.execution_authorized !== false) {
    fail(`${label} violated Risk Gate boundary: execution_authorized must be false`);
  }
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    fail(`Expected JSON from ${response.url || RESOURCE_URL}, got: ${text.slice(0, 300)}`);
  }
}

async function main() {
  requireTestnetAck();
  requirePrivateKey();

  const resource = new URL(RESOURCE_URL);
  if (resource.protocol !== "https:" || resource.hostname !== "geomacro.live" || resource.pathname !== "/api/x402/risk") {
    fail("Paid E2E resource is not the pinned Geomacro HTTPS x402 endpoint");
  }

  const wallet = new Wallet(PRIVATE_KEY);
  const payer = normalizeAddress(wallet.address, "Derived buyer address");
  if (EXPECTED_BUYER && normalizeAddress(EXPECTED_BUYER, "Expected buyer address") !== payer) {
    fail("Configured expected buyer address does not match the private key");
  }

  // Structural adapter: x402 expects { address, signTypedData(args) }.
  const signer = {
    address: payer,
    signTypedData: async ({ domain, types, message }) => wallet.signTypedData(domain, types, message),
  };

  const core = new x402Client();
  core.register(EXPECTED_NETWORK, new ExactEvmScheme(signer));
  const httpClient = new x402HTTPClient(core);

  const clientRequestId = process.env.GEOMACRO_COINBASE_X402_CLIENT_REQUEST_ID || `coinbase-x402-${randomUUID()}`;
  const requestBody = {
    subject: { type: "country", country_iso3: "USA" },
    policy_preset: "balanced",
    action_type: "treasury_payment",
    amount_usdc: 1000,
    client_request_id: clientRequestId,
  };
  const serializedBody = JSON.stringify(requestBody);
  const baseHeaders = { "Content-Type": "application/json", Accept: "application/json" };

  const initial = await fetch(RESOURCE_URL, {
    method: "POST",
    headers: baseHeaders,
    body: serializedBody,
    redirect: "error",
  });

  if (initial.status !== 402) {
    fail(`Expected initial HTTP 402, received ${initial.status}`);
  }

  const initialBody = await readJson(initial);
  const paymentRequiredHeader = initial.headers.get("PAYMENT-REQUIRED");
  if (!paymentRequiredHeader) fail("Initial 402 is missing PAYMENT-REQUIRED");

  const decodedHeader = decodeBase64Json(paymentRequiredHeader);
  if (!decodedHeader || decodedHeader.x402Version !== 2) fail("PAYMENT-REQUIRED is not valid x402 v2");

  const paymentRequired = httpClient.getPaymentRequiredResponse(
    (name) => initial.headers.get(name),
    initialBody,
  );

  if (!paymentRequired || paymentRequired.x402Version !== 2) fail("x402 client could not parse v2 payment requirements");
  if (!Array.isArray(paymentRequired.accepts) || paymentRequired.accepts.length !== 1) {
    fail("Paid E2E requires exactly one advertised payment option");
  }

  const requirement = paymentRequired.accepts[0];
  if (requirement.scheme !== "exact") fail(`Unexpected x402 scheme: ${requirement.scheme}`);
  if (requirement.network !== EXPECTED_NETWORK) fail(`Unexpected x402 network: ${requirement.network}`);
  const asset = normalizeAddress(requirement.asset, "Advertised asset");
  if (asset !== normalizeAddress(EXPECTED_ASSET, "Expected Base Sepolia USDC")) {
    fail(`Unexpected payment asset: ${requirement.asset}`);
  }
  const payTo = normalizeAddress(requirement.payTo, "Advertised payTo");
  const amountAtomic = BigInt(requirement.amount);
  if (amountAtomic <= 0n || amountAtomic > MAX_PAYMENT_ATOMIC) {
    fail(`Payment amount ${amountAtomic} exceeds hard cap ${MAX_PAYMENT_ATOMIC}`);
  }

  const provider = new JsonRpcProvider(RPC_URL, 84532, { staticNetwork: true });
  const network = await provider.getNetwork();
  if (network.chainId !== 84532n) fail(`RPC is not Base Sepolia: chainId=${network.chainId}`);

  const usdc = new Contract(EXPECTED_ASSET, USDC_ABI, provider);
  const beforeBalance = BigInt(await usdc.balanceOf(payer));
  if (beforeBalance < amountAtomic) {
    fail(`Buyer has insufficient Base Sepolia USDC: balance=${beforeBalance}, required=${amountAtomic}`);
  }

  const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
  const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);
  const signatureHeader = paymentHeaders["PAYMENT-SIGNATURE"] || paymentHeaders["payment-signature"];
  if (!signatureHeader) fail("x402 client did not produce PAYMENT-SIGNATURE");

  // Intentionally one paid attempt only. No automatic retry after a signed payment exists.
  const paid = await fetch(RESOURCE_URL, {
    method: "POST",
    headers: { ...baseHeaders, ...paymentHeaders },
    body: serializedBody,
    redirect: "error",
  });
  const paidBody = await readJson(paid);
  if (paid.status !== 200) fail(`Paid request failed with HTTP ${paid.status}`);
  assertRiskBoundary(paidBody, "Paid response");

  const settlement = httpClient.getPaymentSettleResponse((name) => paid.headers.get(name));
  const txHash = extractSettlementTx(settlement);
  if (!txHash) fail("Paid response is missing a valid settlement transaction hash");

  const receipt = await provider.waitForTransaction(txHash, 1, 60_000);
  if (!receipt || receipt.status !== 1) fail(`Settlement transaction did not confirm successfully: ${txHash}`);

  const afterFirstBalance = BigInt(await usdc.balanceOf(payer));
  const observedDebit = beforeBalance - afterFirstBalance;
  if (observedDebit !== amountAtomic) {
    fail(`Unexpected USDC debit after first settlement: observed=${observedDebit}, expected=${amountAtomic}`);
  }

  // Replay the exact same signed proof + exact same request. Server must return cached delivery, not settle again.
  const replay = await fetch(RESOURCE_URL, {
    method: "POST",
    headers: { ...baseHeaders, ...paymentHeaders },
    body: serializedBody,
    redirect: "error",
  });
  const replayBody = await readJson(replay);
  if (replay.status !== 200) fail(`Replay request failed with HTTP ${replay.status}`);
  assertRiskBoundary(replayBody, "Replay response");

  await new Promise((resolve) => setTimeout(resolve, 2_000));
  const afterReplayBalance = BigInt(await usdc.balanceOf(payer));
  if (afterReplayBalance !== afterFirstBalance) {
    fail(`Replay changed buyer USDC balance: before=${afterFirstBalance}, after=${afterReplayBalance}`);
  }

  const replayPaymentResponseRaw = replay.headers.get("PAYMENT-RESPONSE");
  const replaySettlement = replayPaymentResponseRaw ? decodeBase64Json(replayPaymentResponseRaw) : null;
  const replayTxHash = extractSettlementTx(replaySettlement);
  if (replayTxHash && replayTxHash.toLowerCase() !== txHash.toLowerCase()) {
    fail(`Replay returned a different settlement transaction: ${replayTxHash}`);
  }

  // Reuse the exact signed proof with changed business terms. Binding must fail closed with a conflict and no debit.
  const conflictBody = JSON.stringify({ ...requestBody, amount_usdc: 1001 });
  const conflict = await fetch(RESOURCE_URL, {
    method: "POST",
    headers: { ...baseHeaders, ...paymentHeaders },
    body: conflictBody,
    redirect: "error",
  });
  await readJson(conflict);
  if (conflict.status !== 409) {
    fail(`Expected reused-proof/different-request conflict HTTP 409, received ${conflict.status}`);
  }

  await new Promise((resolve) => setTimeout(resolve, 2_000));
  const afterConflictBalance = BigInt(await usdc.balanceOf(payer));
  if (afterConflictBalance !== afterReplayBalance) {
    fail(`Conflict path changed buyer USDC balance: before=${afterReplayBalance}, after=${afterConflictBalance}`);
  }

  const evidence = {
    schema_version: "coinbase-x402-base-sepolia-paid-e2e-v1",
    generated_at: new Date().toISOString(),
    commercial_revenue: false,
    environment: "testnet",
    resource: RESOURCE_URL,
    network: EXPECTED_NETWORK,
    chain_id: 84532,
    asset: normalizeAddress(EXPECTED_ASSET, "Expected Base Sepolia USDC"),
    amount_atomic: amountAtomic.toString(),
    amount_usdc: Number(amountAtomic) / 1_000_000,
    payer,
    pay_to: payTo,
    client_request_id: clientRequestId,
    initial_status: initial.status,
    paid_status: paid.status,
    replay_status: replay.status,
    conflict_status: conflict.status,
    settlement_tx_hash: txHash,
    settlement_block_number: receipt.blockNumber,
    settlement_status: receipt.status === 1 ? "confirmed" : "failed",
    payer_usdc_before_atomic: beforeBalance.toString(),
    payer_usdc_after_first_atomic: afterFirstBalance.toString(),
    payer_usdc_after_replay_atomic: afterReplayBalance.toString(),
    payer_usdc_after_conflict_atomic: afterConflictBalance.toString(),
    observed_first_debit_atomic: observedDebit.toString(),
    replay_balance_delta_atomic: (afterFirstBalance - afterReplayBalance).toString(),
    conflict_balance_delta_atomic: (afterReplayBalance - afterConflictBalance).toString(),
    duplicate_charge_count: 0,
    execution_authorized: false,
    payment_signature_persisted: false,
    private_key_persisted: false,
    acceptance: {
      initial_402: true,
      paid_200: true,
      settlement_confirmed: true,
      exact_debit_matches_advertised_amount: true,
      replay_200: true,
      replay_no_second_debit: true,
      reused_proof_different_request_conflict_409: true,
      conflict_no_debit: true,
    },
  };

  await mkdir(ARTIFACT_DIR, { recursive: true });
  const artifactPath = path.join(ARTIFACT_DIR, `coinbase-x402-base-sepolia-paid-${Date.now()}.json`);
  await writeFile(artifactPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });

  console.log("PASS: Coinbase x402 Base Sepolia paid E2E completed");
  console.log(`Settlement: ${txHash}`);
  console.log(`Evidence: ${artifactPath}`);
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
