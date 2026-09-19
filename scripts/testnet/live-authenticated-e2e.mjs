import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Contract, JsonRpcProvider, Wallet } from "ethers";

const BASE_URL = String(process.env.GEOMACRO_TESTNET_E2E_BASE_URL || "https://geomacro.live").replace(/\/$/, "");
const EXPECTED_HOST = String(process.env.GEOMACRO_TESTNET_E2E_EXPECTED_HOST || "geomacro.live").trim().toLowerCase();
const PRIVATE_KEY = String(process.env.GEOMACRO_TESTNET_E2E_PRIVATE_KEY || "").trim();
const CHAIN_KEY = String(process.env.GEOMACRO_TESTNET_E2E_CHAIN_KEY || "arcTestnet").trim();
const MODE = String(process.env.GEOMACRO_TESTNET_E2E_MODE || "quote_only").trim();
const ACK = String(process.env.GEOMACRO_TESTNET_E2E_ACK || "").trim();
const MAX_USDC = Number(process.env.GEOMACRO_TESTNET_E2E_MAX_USDC || "0.5");
const ARTIFACT_DIR = String(process.env.GEOMACRO_TESTNET_E2E_ARTIFACT_DIR || "artifacts/testnet-live-e2e");

const CHAIN_IDS = {
  arcTestnet: 5_042_002,
  baseSepolia: 84_532,
  polygonAmoy: 80_002,
};

const DEFAULT_RPC = {
  arcTestnet: "https://rpc.testnet.arc.network",
};

const SLO_MS = {
  challenge: 5_000,
  verify: 8_000,
  bootstrap: 5_000,
  quote: 8_000,
  settled_delivery: 15_000,
  replay: 8_000,
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requestId(prefix = "live-e2e") {
  return `${prefix}-${Date.now()}-${crypto.randomUUID()}`;
}

function extractCookie(headers) {
  const raw = headers.get("set-cookie") || "";
  const pair = raw.split(";", 1)[0]?.trim();
  assert(pair && pair.includes("="), "Wallet sign-in did not return a session cookie");
  return pair;
}

function noExecutionAuthorization(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return true;
  seen.add(value);
  for (const [key, nested] of Object.entries(value)) {
    if (key === "execution_authorized" && nested === true) return false;
    if (!noExecutionAuthorization(nested, seen)) return false;
  }
  return true;
}

async function jsonFetch(label, url, options = {}, expectedStatuses = [200]) {
  const started = performance.now();
  const response = await fetch(url, {
    ...options,
    headers: {
      accept: "application/json",
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(Number(options.timeout_ms || 20_000)),
  });
  const elapsed_ms = Number((performance.now() - started).toFixed(1));
  const payload = await response.json().catch(() => null);
  assert(expectedStatuses.includes(response.status), `${label} returned HTTP ${response.status}: ${JSON.stringify(payload)?.slice(0, 600)}`);
  assert(payload && typeof payload === "object" && !Array.isArray(payload), `${label} returned invalid JSON`);
  assert(noExecutionAuthorization(payload), `${label} attempted to authorize execution`);
  return { response, payload, elapsed_ms };
}

function assertSlo(label, elapsedMs) {
  const limit = SLO_MS[label];
  if (limit && elapsedMs > limit) {
    throw new Error(`${label} latency ${elapsedMs}ms exceeded ${limit}ms SLO`);
  }
}

async function signIn(wallet, chainId) {
  const origin = new URL(BASE_URL).origin;
  const challenge = await jsonFetch(
    "auth challenge",
    `${BASE_URL}/api/testnet-tester/auth-challenge`,
    {
      method: "POST",
      headers: { origin, referer: `${BASE_URL}/testnet-access` },
      body: JSON.stringify({ wallet_address: wallet.address, chain_id: chainId }),
    },
  );
  assertSlo("challenge", challenge.elapsed_ms);
  assert(challenge.payload?.ok === true, "Wallet challenge did not succeed");
  const data = challenge.payload.data;
  assert(data?.message && data?.nonce && data?.issued_at, "Wallet challenge is incomplete");

  const signature = await wallet.signMessage(data.message);
  const verify = await jsonFetch(
    "auth verify",
    `${BASE_URL}/api/testnet-tester/auth-verify`,
    {
      method: "POST",
      headers: { origin, referer: `${BASE_URL}/testnet-access` },
      body: JSON.stringify({
        wallet_address: wallet.address,
        chain_id: chainId,
        nonce: data.nonce,
        issued_at: data.issued_at,
        message: data.message,
        signature,
        profile_name: "Geomacro E2E Probe",
      }),
    },
  );
  assertSlo("verify", verify.elapsed_ms);
  assert(verify.payload?.ok === true && verify.payload?.data?.access_status === "active", "Wallet verification did not activate Testnet access");
  return {
    cookie: extractCookie(verify.response.headers),
    principal_id: String(verify.payload.data.principal_id),
    challenge_ms: challenge.elapsed_ms,
    verify_ms: verify.elapsed_ms,
  };
}

async function main() {
  const parsedBase = new URL(BASE_URL);
  assert(parsedBase.protocol === "https:", "E2E target must use HTTPS");
  assert(parsedBase.hostname.toLowerCase() === EXPECTED_HOST, `Refusing unexpected host ${parsedBase.hostname}`);
  assert(["quote_only", "paid"].includes(MODE), "GEOMACRO_TESTNET_E2E_MODE must be quote_only or paid");
  assert(Object.hasOwn(CHAIN_IDS, CHAIN_KEY), `Unsupported chain key ${CHAIN_KEY}`);
  assert(/^0x[0-9a-fA-F]{64}$/.test(PRIVATE_KEY), "Dedicated E2E private key is not configured");
  assert(Number.isFinite(MAX_USDC) && MAX_USDC > 0 && MAX_USDC <= 10, "GEOMACRO_TESTNET_E2E_MAX_USDC is invalid");
  if (MODE === "paid") {
    assert(ACK === "GEOMACRO_TESTNET_USDC", "Paid mode requires GEOMACRO_TESTNET_E2E_ACK=GEOMACRO_TESTNET_USDC");
  }

  const wallet = new Wallet(PRIVATE_KEY);
  const chainId = CHAIN_IDS[CHAIN_KEY];
  const first = await signIn(wallet, chainId);

  const bootstrapStarted = performance.now();
  const [me, config, keysBefore] = await Promise.all([
    jsonFetch("tester account", `${BASE_URL}/api/testnet-tester/me`, { headers: { cookie: first.cookie } }),
    jsonFetch("tester config", `${BASE_URL}/api/testnet-tester/config`, { headers: { cookie: first.cookie } }),
    jsonFetch("developer keys", `${BASE_URL}/api/testnet-tester/developer-keys`, { headers: { cookie: first.cookie } }),
  ]);
  const bootstrap_ms = Number((performance.now() - bootstrapStarted).toFixed(1));
  assertSlo("bootstrap", bootstrap_ms);
  assert(me.payload?.data?.access_status === "active", "Tester account is not active after sign-in");
  assert(config.payload?.data?.payment_model === "pay_per_call", "Unexpected payment model");

  const configuredChain = (config.payload?.data?.chains || []).find((chain) => chain.key === CHAIN_KEY);
  assert(configuredChain?.public_api_key, `Public API key missing for ${CHAIN_KEY}`);

  // Every published public chain key must be able to reach the same
  // canonical pay-per-call endpoint and must quote only its bound chain.
  const publicChainKeys = [
    { key: "arcTestnet", public_api_key: "gmk_public_arc_testnet_v1" },
    { key: "baseSepolia", public_api_key: "gmk_public_base_sepolia_v1" },
    { key: "polygonAmoy", public_api_key: "gmk_public_polygon_amoy_v1" },
  ];
  const publicQuoteChecks = [];
  for (const entry of publicChainKeys) {
    const publicQuote = await jsonFetch(
      "public API quote " + entry.key,
      `${BASE_URL}/api/testnet-tester/intelligence`,
      {
        method: "POST",
        headers: { cookie: first.cookie, "x-geomacro-public-key": entry.public_api_key },
        body: JSON.stringify({
          request_id: requestId("public-quote-" + entry.key),
          capability: "gri_read",
          subject: { type: "global" },
        }),
      },
      [402],
    );
    assert(publicQuote.payload?.error?.code === "TESTNET_PAYMENT_REQUIRED", "Public " + entry.key + " did not return the payment-required contract");
    const supported = publicQuote.payload?.payment?.supported_chains || [];
    assert(supported.length === 1 && supported[0]?.key === entry.key, "Public " + entry.key + " quote was not bound to its published payment chain");
    publicQuoteChecks.push({
      chain_key: entry.key,
      public_api_key: entry.public_api_key,
      amount_due_usdc: publicQuote.payload.payment.amount_due_usdc,
      credit_cost: publicQuote.payload.payment.credit_cost,
    });
  }

  // Reconnect with the same wallet. The principal must be stable, and any
  // existing developer API key identifiers must remain stable rather than being
  // regenerated on reconnect.
  const second = await signIn(wallet, chainId);
  assert(second.principal_id === first.principal_id, "Same-wallet reconnect created a different principal");
  const keysAfter = await jsonFetch("developer keys after reconnect", `${BASE_URL}/api/testnet-tester/developer-keys`, { headers: { cookie: second.cookie } });
  const beforeIds = (keysBefore.payload?.data || []).map((item) => String(item.id || item.key_id || item.api_key || "")).sort();
  const afterIds = (keysAfter.payload?.data || []).map((item) => String(item.id || item.key_id || item.api_key || "")).sort();
  assert(JSON.stringify(beforeIds) === JSON.stringify(afterIds), "Developer API key identity changed after same-wallet reconnect");

  const cookie = second.cookie;
  const req = {
    request_id: requestId(),
    capability: "gri_read",
    subject: { type: "global" },
  };

  const quote = await jsonFetch(
    "price quote",
    `${BASE_URL}/api/testnet-tester/intelligence`,
    {
      method: "POST",
      headers: { cookie, "x-geomacro-public-key": configuredChain.public_api_key },
      body: JSON.stringify(req),
    },
    [402],
  );
  assertSlo("quote", quote.elapsed_ms);
  assert(quote.payload?.error?.code === "TESTNET_PAYMENT_REQUIRED", "Expected TESTNET_PAYMENT_REQUIRED quote");
  assert(quote.payload?.payment?.payment_model === "pay_per_call", "Quote payment model is invalid");
  assert((quote.payload?.payment?.supported_chains || []).length === 1, "Quote must be bound to exactly one public-key payment chain");
  assert(quote.payload.payment.supported_chains[0].key === CHAIN_KEY, "Quote chain does not match selected public API key");
  assert(Number(quote.payload.payment.amount_due_usdc) <= MAX_USDC, `Quoted ${quote.payload.payment.amount_due_usdc} Testnet USDC exceeds safety cap ${MAX_USDC}`);

  const report = {
    ok: true,
    mode: MODE,
    target_host: parsedBase.hostname,
    chain_key: CHAIN_KEY,
    chain_id: chainId,
    wallet_address: wallet.address,
    principal_stable_after_reconnect: true,
    developer_key_ids_stable_after_reconnect: true,
    request_id: req.request_id,
    public_api: {
      all_published_public_keys_quoted: publicQuoteChecks.length === 3,
      quote_checks: publicQuoteChecks,
    },
    quote: {
      credit_cost: quote.payload.payment.credit_cost,
      amount_due_usdc: quote.payload.payment.amount_due_usdc,
      pricing_version: quote.payload.payment.pricing_version,
    },
    timings_ms: {
      challenge: first.challenge_ms,
      verify: first.verify_ms,
      reconnect_challenge: second.challenge_ms,
      reconnect_verify: second.verify_ms,
      bootstrap: bootstrap_ms,
      quote: quote.elapsed_ms,
    },
    paid_settlement_executed: false,
    commercial_revenue: false,
    execution_authorized: false,
  };

  if (MODE === "paid") {
    const rpcUrl = String(process.env.GEOMACRO_TESTNET_E2E_RPC_URL || DEFAULT_RPC[CHAIN_KEY] || "").trim();
    assert(/^https:\/\//.test(rpcUrl), `A dedicated HTTPS RPC URL is required for ${CHAIN_KEY}`);
    assert(config.payload?.data?.payment_configured === true, "Testnet payment receiver is not configured on the live service");

    const provider = new JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true });
    const network = await provider.getNetwork();
    assert(Number(network.chainId) === chainId, `RPC chain mismatch: expected ${chainId}, got ${network.chainId}`);
    const payer = wallet.connect(provider);
    const quotedChain = quote.payload.payment.supported_chains[0];
    const usdc = new Contract(
      quotedChain.usdc_address,
      [
        "function balanceOf(address) view returns (uint256)",
        "function transfer(address to,uint256 value) returns (bool)",
      ],
      payer,
    );
    const amountAtomic = BigInt(String(quote.payload.payment.amount_due_atomic));
    const balance = BigInt(await usdc.balanceOf(wallet.address));
    assert(balance >= amountAtomic, `Dedicated E2E wallet lacks Testnet USDC. Need ${amountAtomic}, have ${balance}`);

    const tx = await usdc.transfer(quote.payload.payment.receiver_address, amountAtomic);
    const receipt = await tx.wait(1);
    assert(receipt?.status === 1, "Testnet USDC payment transaction reverted");
    const proof = {
      chain_key: CHAIN_KEY,
      tx_hash: String(tx.hash),
      payer_address: wallet.address,
    };

    const settled = await jsonFetch(
      "settled delivery",
      `${BASE_URL}/api/testnet-tester/intelligence`,
      {
        method: "POST",
        headers: { cookie, "x-geomacro-public-key": configuredChain.public_api_key },
        body: JSON.stringify({ ...req, payment: proof }),
        timeout_ms: 30_000,
      },
    );
    assertSlo("settled_delivery", settled.elapsed_ms);
    assert(settled.payload?.ok === true, "Paid request did not deliver intelligence");
    const remainingAfterSettlement = settled.payload?.entitlement?.credits_remaining;

    const replay = await jsonFetch(
      "idempotent replay",
      `${BASE_URL}/api/testnet-tester/intelligence`,
      {
        method: "POST",
        headers: { cookie, "x-geomacro-public-key": configuredChain.public_api_key },
        body: JSON.stringify({ ...req, payment: proof }),
      },
    );
    assertSlo("replay", replay.elapsed_ms);
    assert(replay.payload?.ok === true, "Exact paid replay did not remain idempotent");
    if (remainingAfterSettlement != null && replay.payload?.entitlement?.credits_remaining != null) {
      assert(Number(replay.payload.entitlement.credits_remaining) === Number(remainingAfterSettlement), "Exact replay consumed credits twice");
    }

    const reused = await jsonFetch(
      "cross-request payment replay",
      `${BASE_URL}/api/testnet-tester/intelligence`,
      {
        method: "POST",
        headers: { cookie, "x-geomacro-public-key": configuredChain.public_api_key },
        body: JSON.stringify({ ...req, request_id: requestId("replay-block"), payment: proof }),
      },
      [409],
    );
    assert(reused.payload?.error?.code === "TESTNET_PAYMENT_ALREADY_CLAIMED", "Reused payment proof was not rejected on a different request_id");

    Object.assign(report.timings_ms, {
      settled_delivery: settled.elapsed_ms,
      idempotent_replay: replay.elapsed_ms,
    });
    Object.assign(report, {
      paid_settlement_executed: true,
      tx_hash: tx.hash,
      block_number: receipt.blockNumber,
      paid_amount_usdc: quote.payload.payment.amount_due_usdc,
      idempotent_replay_passed: true,
      cross_request_replay_blocked: true,
      final_delivery_ok: true,
    });
  }

  await mkdir(ARTIFACT_DIR, { recursive: true });
  const artifact = path.join(ARTIFACT_DIR, `live-testnet-e2e-${Date.now()}.json`);
  await writeFile(artifact, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ...report, artifact }, null, 2));
}

await main();
