import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Contract, JsonRpcProvider, Wallet } from 'ethers';

const BASE_URL = String(process.env.GEOMACRO_TESTNET_E2E_BASE_URL || 'https://geomacro.live').replace(/\/$/, '');
const EXPECTED_HOST = String(process.env.GEOMACRO_TESTNET_E2E_EXPECTED_HOST || 'geomacro.live').trim().toLowerCase();
const PRIVATE_KEY = String(process.env.GEOMACRO_TESTNET_E2E_PRIVATE_KEY || '').trim();
const CHAIN_KEY = String(process.env.GEOMACRO_TESTNET_E2E_CHAIN_KEY || 'arcTestnet').trim();
const RPC_URL = String(process.env.GEOMACRO_TESTNET_E2E_RPC_URL || 'https://rpc.testnet.arc.network').trim();
const MAX_USDC = Number(process.env.GEOMACRO_TESTNET_E2E_MAX_USDC || '0.5');
const ARTIFACT_DIR = String(process.env.GEOMACRO_TESTNET_E2E_ARTIFACT_DIR || 'artifacts/testnet-developer-live-e2e');

const CHAINS = { arcTestnet: 5042002, baseSepolia: 84532, polygonAmoy: 80002 };
const CAPABILITIES = ['intelligence_query','gri_read','structural_country_digest','structural_corridor_digest','structural_country_profile','structural_corridor_profile','signed_risk_object','risk_gate_bundle'];

function assert(condition, message) { if (!condition) throw new Error(message); }
function rid(prefix) { return prefix + '-' + Date.now() + '-' + crypto.randomUUID(); }
function authHeaders(apiKey, apiSecret) {
  return { authorization: 'GeomacroTest ' + apiKey + '.' + apiSecret };
}

function extractCookie(headers) {
  const raw = headers.get('set-cookie') || '';
  const pair = raw.split(';', 1)[0]?.trim();
  assert(pair && pair.includes('='), 'Wallet sign-in did not return a session cookie');
  return pair;
}

async function signIn(wallet, chainId) {
  const origin = new URL(BASE_URL).origin;
  const challenge = await jsonFetch(
    'developer wallet challenge',
    BASE_URL + '/api/testnet-tester/auth-challenge',
    {
      method: 'POST',
      headers: { origin, referer: BASE_URL + '/testnet-access' },
      body: JSON.stringify({ wallet_address: wallet.address, chain_id: chainId }),
    },
  );
  assert(challenge.payload?.ok === true, 'Developer E2E wallet challenge failed');
  const data = challenge.payload.data;
  assert(data?.message && data?.nonce && data?.issued_at, 'Developer E2E challenge is incomplete');
  const signature = await wallet.signMessage(data.message);
  const verify = await jsonFetch(
    'developer wallet verify',
    BASE_URL + '/api/testnet-tester/auth-verify',
    {
      method: 'POST',
      headers: { origin, referer: BASE_URL + '/testnet-access' },
      body: JSON.stringify({
        wallet_address: wallet.address,
        chain_id: chainId,
        nonce: data.nonce,
        issued_at: data.issued_at,
        message: data.message,
        signature,
        profile_name: 'Geomacro Developer E2E',
      }),
    },
  );
  assert(verify.payload?.ok === true && verify.payload?.data?.access_status === 'active', 'Developer E2E wallet access did not become active');
  return { cookie: extractCookie(verify.response.headers), principal_id: String(verify.payload.data.principal_id) };
}
function noExecutionAuthorization(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return true;
  seen.add(value);
  for (const [key, nested] of Object.entries(value)) {
    if (key === 'execution_authorized' && nested === true) return false;
    if (!noExecutionAuthorization(nested, seen)) return false;
  }
  return true;
}
async function jsonFetch(label, url, options = {}, expected = [200]) {
  const response = await fetch(url, {
    ...options,
    headers: { accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) },
    signal: AbortSignal.timeout(Number(options.timeout_ms || 30000)),
  });
  const payload = await response.json().catch(() => null);
  assert(expected.includes(response.status), label + ' returned HTTP ' + response.status + ': ' + JSON.stringify(payload).slice(0, 1200));
  assert(payload && typeof payload === 'object' && !Array.isArray(payload), label + ' returned invalid JSON');
  assert(noExecutionAuthorization(payload), label + ' attempted to authorize execution');
  return { response, payload };
}
function requestFor(capability) {
  const request = { request_id: rid('quote-' + capability), capability };
  if (capability === 'intelligence_query') request.question = 'What changed in geopolitical or macro risk recently?';
  else if (capability === 'gri_read') request.subject = { type: 'global' };
  else if (capability === 'structural_country_digest' || capability === 'structural_country_profile') request.subject = { type: 'country', country_iso3: 'IND' };
  else if (capability === 'structural_corridor_digest' || capability === 'structural_corridor_profile' || capability === 'risk_gate_bundle') {
    request.subject = { type: 'corridor', origin_country_iso3: 'IND', destination_country_iso3: 'SGP' };
    if (capability === 'risk_gate_bundle') { request.policy_preset = 'balanced'; request.action_type = 'agent_payment'; request.amount_usdc = 1000; }
  }
  else if (capability === 'signed_risk_object') request.subject = { type: 'country', country_iso3: 'USA' };
  return request;
}

async function main() {
  const base = new URL(BASE_URL);
  assert(base.protocol === 'https:', 'Developer E2E requires HTTPS');
  assert(base.hostname.toLowerCase() === EXPECTED_HOST, 'Refusing unexpected host ' + base.hostname);
  assert(/^0x[0-9a-fA-F]{64}$/.test(PRIVATE_KEY), 'Dedicated E2E wallet private key is not configured');
  assert(Object.hasOwn(CHAINS, CHAIN_KEY), 'Unsupported Testnet chain ' + CHAIN_KEY);
  assert(/^https:\/\//.test(RPC_URL), 'Testnet RPC URL must use HTTPS');
  assert(Number.isFinite(MAX_USDC) && MAX_USDC > 0 && MAX_USDC <= 10, 'Testnet E2E max USDC is invalid');

  const manifest = await jsonFetch('developer manifest', BASE_URL + '/api/testnet/manifest');
  assert(manifest.payload.ok === true, 'Developer manifest not healthy');
  assert(manifest.payload.environment === 'testnet', 'Developer manifest is not Testnet');
  assert(manifest.payload.commercial_revenue === false, 'Developer manifest is classified as revenue');
  assert(JSON.stringify(Object.keys(manifest.payload.capabilities || {}).sort()) === JSON.stringify(CAPABILITIES.slice().sort()), 'Developer capability set drifted');

  const wallet = new Wallet(PRIVATE_KEY);
  const session = await signIn(wallet, CHAINS[CHAIN_KEY]);
  const keyList = await jsonFetch(
    'developer credential inventory',
    BASE_URL + '/api/testnet-tester/developer-keys',
    { headers: { cookie: session.cookie } },
  );
  assert(keyList.payload.ok === true, 'Developer credential inventory failed');
  const activeCredential = (keyList.payload.data || []).find((item) => item.enabled === true && !item.revoked_at);

  let credential;
  if (activeCredential?.credential_id) {
    const rotated = await jsonFetch(
      'developer credential rotation',
      BASE_URL + '/api/testnet-tester/developer-key-rotate',
      {
        method: 'POST',
        headers: { cookie: session.cookie },
        body: JSON.stringify({ credential_id: activeCredential.credential_id }),
      },
    );
    credential = rotated.payload.data;
    assert(credential?.api_key && credential?.api_secret, 'Developer credential rotation did not return the one-time credential pair');
    assert(credential.rotated_from_credential_id === activeCredential.credential_id, 'Developer credential rotation provenance is incorrect');
  } else {
    const issued = await jsonFetch(
      'developer credential issuance',
      BASE_URL + '/api/testnet-tester/developer-key',
      {
        method: 'POST',
        headers: { cookie: session.cookie },
        body: JSON.stringify({ label: 'Dedicated automated E2E', integration_type: 'product_api' }),
      },
    );
    credential = issued.payload.data;
    assert(credential?.api_key && credential?.api_secret, 'Developer credential issuance did not return the one-time credential pair');
  }

  const API_KEY = String(credential.api_key);
  const API_SECRET = String(credential.api_secret);
  assert(/^gmk_test_[A-Za-z0-9_-]{20,}$/.test(API_KEY), 'Issued Developer API key format is invalid');
  assert(/^gms_test_[A-Za-z0-9_-]{32,}$/.test(API_SECRET), 'Issued Developer API secret format is invalid');

  const auth = () => ({ authorization: 'GeomacroTest ' + API_KEY + '.' + API_SECRET });
  const account = await jsonFetch('developer account', BASE_URL + '/api/testnet/account', { headers: auth() });
  assert(account.payload.ok === true, 'Developer account failed');
  assert(account.payload.data?.environment === 'testnet', 'Developer account is not Testnet');
  assert(account.payload.data?.payment_model === 'pay_per_call', 'Developer API is not pay-per-call');
  assert(account.payload.data?.commercial_revenue === false, 'Developer account revenue boundary changed');

  const quotes = [];
  let paidSeed = null;
  for (const capability of CAPABILITIES) {
    const request = requestFor(capability);
    const quote = await jsonFetch('402 quote ' + capability, BASE_URL + '/api/testnet/intelligence', { method: 'POST', headers: auth(), body: JSON.stringify(request) }, [402]);
    assert(quote.payload.ok === false, 'Quote must remain non-successful');
    assert(quote.payload.error?.code === 'TESTNET_PAYMENT_REQUIRED', 'Missing TESTNET_PAYMENT_REQUIRED for ' + capability);
    assert(Number(quote.payload.payment?.credit_cost) > 0, 'Missing credit cost for ' + capability);
    assert(Number(quote.payload.payment?.amount_due_usdc) > 0, 'Missing amount for ' + capability);
    assert(Array.isArray(quote.payload.payment?.supported_chains) && quote.payload.payment.supported_chains.length >= 1, 'No payment chains for ' + capability);
    quotes.push({ capability, request_id: request.request_id, credit_cost: quote.payload.payment.credit_cost, amount_due_usdc: quote.payload.payment.amount_due_usdc, amount_due_atomic: quote.payload.payment.amount_due_atomic });
    if (capability === 'gri_read') paidSeed = { request, payment: quote.payload.payment };
  }
  assert(paidSeed, 'No gri_read quote captured');

  const quotedChain = paidSeed.payment.supported_chains.find((item) => item.key === CHAIN_KEY);
  assert(quotedChain, 'Selected Testnet chain is absent from developer quote');
  const amountUsdc = Number(paidSeed.payment.amount_due_usdc);
  assert(amountUsdc <= MAX_USDC, 'Quoted amount exceeds E2E safety cap');
  const provider = new JsonRpcProvider(RPC_URL, CHAINS[CHAIN_KEY], { staticNetwork: true });
  const network = await provider.getNetwork();
  assert(Number(network.chainId) === CHAINS[CHAIN_KEY], 'RPC chain mismatch');
  const payer = wallet.connect(provider);
  const usdc = new Contract(quotedChain.usdc_address, ['function balanceOf(address) view returns (uint256)', 'function transfer(address to,uint256 value) returns (bool)'], payer);
  const amountAtomic = BigInt(String(paidSeed.payment.amount_due_atomic));
  assert(BigInt(await usdc.balanceOf(wallet.address)) >= amountAtomic, 'Dedicated E2E wallet lacks enough Testnet USDC');
  const tx = await usdc.transfer(paidSeed.payment.receiver_address, amountAtomic);
  const receipt = await tx.wait(1);
  assert(receipt?.status === 1, 'Testnet USDC transfer reverted');
  const proof = { chain_key: CHAIN_KEY, tx_hash: String(tx.hash), payer_address: wallet.address };

  const settled = await jsonFetch('developer paid delivery', BASE_URL + '/api/testnet/intelligence', { method: 'POST', headers: auth(), body: JSON.stringify({ ...paidSeed.request, payment: proof }), timeout_ms: 30000 });
  assert(settled.payload.ok === true, 'Developer paid delivery failed');
  assert(settled.payload.request_id === paidSeed.request.request_id, 'Request binding changed');
  assert(settled.payload.entitlement?.idempotent_replay === false, 'Initial delivery incorrectly marked replay');
  assert(settled.payload.payment?.payment_event_id, 'Missing payment_event_id');
  assert(settled.payload.audit?.response_sha256, 'Missing response SHA');
  const creditsAfter = settled.payload.entitlement?.credits_remaining;

  const replay = await jsonFetch('developer exact replay', BASE_URL + '/api/testnet/intelligence', { method: 'POST', headers: auth(), body: JSON.stringify({ ...paidSeed.request, payment: proof }) });
  assert(replay.payload.ok === true, 'Exact replay failed');
  assert(replay.payload.entitlement?.idempotent_replay === true, 'Exact replay was not idempotent');
  if (creditsAfter != null && replay.payload.entitlement?.credits_remaining != null) assert(Number(replay.payload.entitlement.credits_remaining) === Number(creditsAfter), 'Exact replay consumed credits twice');

  const crossRequest = await jsonFetch('developer cross-request payment replay', BASE_URL + '/api/testnet/intelligence', { method: 'POST', headers: auth(), body: JSON.stringify({ ...paidSeed.request, request_id: rid('cross-request'), payment: proof }) }, [409]);
  assert(crossRequest.payload.error?.code === 'TESTNET_PAYMENT_ALREADY_CLAIMED', 'Payment proof was reusable across request IDs');

  const changedPayload = { ...paidSeed.request, subject: { type: 'country', country_iso3: 'IND' }, payment: proof };
  const changed = await jsonFetch('developer same-id changed-payload replay', BASE_URL + '/api/testnet/intelligence', { method: 'POST', headers: auth(), body: JSON.stringify(changedPayload) }, [400, 409]);
  assert(['TESTNET_REQUEST_BINDING_MISMATCH','TESTNET_PAYMENT_ALREADY_CLAIMED','TESTNET_REQUEST_ID_REUSED'].includes(changed.payload.error?.code), 'Changed payload replay was not rejected');

  const report = {
    ok: true,
    target_host: base.hostname,
    chain_key: CHAIN_KEY,
    wallet_address: wallet.address,
    developer_key_id: API_KEY,
    credential_rotated_or_issued: true,
    all_eight_quote_checks_passed: quotes.length === 8,
    quote_checks: quotes,
    paid_e2e: {
      capability: 'gri_read',
      request_id: paidSeed.request.request_id,
      tx_hash: tx.hash,
      block_number: receipt.blockNumber,
      amount_due_usdc: amountUsdc,
      payment_event_id: settled.payload.payment.payment_event_id,
      delivery_id: settled.payload.delivery_id,
      credits_remaining_after_settlement: creditsAfter ?? null,
      exact_replay_idempotent: true,
      cross_request_payment_replay_blocked: true,
      changed_payload_replay_blocked: true,
    },
    execution_authorized: false,
    commercial_revenue: false,
  };
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const artifact = path.join(ARTIFACT_DIR, 'live-developer-api-e2e-' + Date.now() + '.json');
  await writeFile(artifact, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({ ...report, artifact }, null, 2));
}

await main();