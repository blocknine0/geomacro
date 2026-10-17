import { createHash, randomBytes } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { keccak256, toUtf8Bytes, verifyTypedData } from 'ethers';
import { GEOMACRO_USDC_NATIVE_RAILS } from '../../src/lib/usdc-native-rail-identities.ts';
import { assertCapabilityPrequote } from '../../workers/commerce-ledger/src/capability-prequote.mjs';

// Circle Facilitator Service is a different protocol from Gateway batching.
// This adapter only verifies authorizations. It has NO settlement method and
// cannot enable a payment route, disclose a product or authorize funds.
const ORIGIN = 'https://api.circle.com/v1/facilitator/x402';
const ADDRESS = /^0x[0-9a-fA-F]{40}$/u;
const ZERO = /^0x0{40}$/iu;
const UINT = /^(0|[1-9][0-9]*)$/u;
const TYPES = { SellerRequest: [
  { name: 'purpose', type: 'string' }, { name: 'method', type: 'string' },
  { name: 'bodyHash', type: 'bytes32' }, { name: 'network', type: 'string' },
  { name: 'payTo', type: 'address' }, { name: 'nonce', type: 'bytes32' },
  { name: 'issuedAt', type: 'uint64' }, { name: 'expiresAt', type: 'uint64' },
] };
const rails = Object.values(GEOMACRO_USDC_NATIVE_RAILS);
const fail = code => { throw new Error('CIRCLE_FACILITATOR_' + code); };

async function jsonRequest(path, options, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(ORIGIN + path, {
      ...options, redirect: 'error', signal: AbortSignal.timeout(10_000),
    });
  } catch { fail('TRANSPORT_UNAVAILABLE'); }
  if (!response.ok) fail('HTTP_' + response.status);
  // Never echo provider error text, request authorization, seller proof or keys.
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (!Number.isFinite(declared) || declared > 65536) fail('RESPONSE_TOO_LARGE');
  let raw;
  try { raw = await response.text(); } catch { fail('RESPONSE_UNREADABLE'); }
  if (Buffer.byteLength(raw, 'utf8') > 65536) fail('RESPONSE_TOO_LARGE');
  try { return JSON.parse(raw); } catch { fail('INVALID_JSON'); }
}

export async function readCircleFacilitatorSupport({ fetchImpl = fetch } = {}) {
  const supported = await jsonRequest('/supported', { method: 'GET' }, fetchImpl);
  if (supported?.x402Version !== 2 || !Array.isArray(supported.kinds))
    fail('SUPPORTED_CONTRACT_INVALID');
  return supported;
}

export function circleNativeExactKind(supported, network, asset) {
  const rail = rails.find(r => r.caip2 === network && r.asset.toLowerCase() === asset.toLowerCase());
  if (!rail) fail('NATIVE_RAIL_REQUIRED');
  const matches = supported?.kinds?.filter(k => k.x402Version === 2 &&
    k.scheme === 'exact' && k.network === network &&
    typeof k.asset === 'string' && k.asset.toLowerCase() === rail.asset.toLowerCase() &&
    k.decimals === 6 && typeof k.extra?.name === 'string' && k.extra.name.length > 0 &&
    k.extra.name !== 'GatewayWalletBatched' && k.extra.version === '2' &&
    (!k.extra.assetTransferMethod || k.extra.assetTransferMethod === 'eip3009')) ?? [];
  if (matches.length !== 1) fail('NATIVE_EXACT_NOT_SUPPORTED');
  return matches[0];
}

export async function signCircleVerificationProof({ network, payTo, body, signer, nowMs = Date.now() }) {
  const rail = rails.find(r => r.caip2 === network);
  if (!rail || !ADDRESS.test(payTo) || ZERO.test(payTo) || !Number.isSafeInteger(nowMs))
    fail('SELLER_SCOPE_INVALID');
  let parsed;
  try { parsed = JSON.parse(body); } catch { fail('SELLER_BODY_INVALID'); }
  if (parsed?.paymentRequirements?.network !== network ||
      parsed?.paymentRequirements?.payTo?.toLowerCase() !== payTo.toLowerCase())
    fail('SELLER_BODY_SCOPE_MISMATCH');
  // A signer can be injected from a protected signing service; no wallet key
  // is loaded from caller JSON or committed configuration. EOA sellers only.
  const issuedAt = Math.floor(nowMs / 1000), expiresAt = issuedAt + 300;
  const nonce = '0x' + randomBytes(32).toString('hex');
  const domain = { name: 'Circle Facilitator Seller Request', version: '1', chainId: rail.chain_id };
  const message = { purpose: 'verify', method: 'POST', bodyHash: keccak256(toUtf8Bytes(body)),
    network, payTo, nonce, issuedAt, expiresAt };
  let signature;
  try {
    signature = await signer.signTypedData(domain, TYPES, message);
    if (verifyTypedData(domain, TYPES, message, signature).toLowerCase() !== payTo.toLowerCase())
      fail('SELLER_KEY_MISMATCH');
  } catch { fail('SELLER_PROOF_INVALID'); }
  return Buffer.from(JSON.stringify({ version: 1, signature, network, payTo, nonce,
    issuedAt, expiresAt }), 'utf8').toString('base64url');
}

/** The quote must come from the canonical private prepared-answer vault.
 * Local quote/hash admission is NOT evidence of source rights or a substitute
 * for live DO readback. The caller must independently do that first.
 */
export async function verifyCirclePreparedAuthorization({ quote, customerBytes,
  paymentPayload, signer, apiKey, fetchImpl = fetch, nowMs = Date.now() }) {
  await assertCapabilityPrequote(quote,
    { provider: 'circle_gateway_x402', providerEnvironment: 'production' }, nowMs);
  if (typeof customerBytes !== 'string' || Buffer.byteLength(customerBytes) > 1_048_576 ||
      createHash('sha256').update(customerBytes, 'utf8').digest('hex') !== quote.prepared_answer_sha256)
    fail('PREPARED_BYTES_MISMATCH');
  if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/u.test(apiKey))
    fail('API_KEY_REQUIRED');
  const payload = paymentPayload?.payload;
  const auth = payload?.authorization;
  const now = Math.floor(nowMs / 1000);
  if (paymentPayload?.x402Version !== 2 || !auth ||
      !ADDRESS.test(auth.from) || ZERO.test(auth.from) ||
      auth.to?.toLowerCase() !== quote.recipient || auth.value !== quote.amount_atomic ||
      !UINT.test(auth.validAfter) || !UINT.test(auth.validBefore) ||
      BigInt(auth.validAfter) > BigInt(now) || BigInt(auth.validBefore) <= BigInt(now) ||
      BigInt(auth.validBefore) > BigInt(Math.floor(Date.parse(quote.expires_at) / 1000)) ||
      !/^0x[0-9a-fA-F]{64}$/u.test(auth.nonce) ||
      !/^0x[0-9a-fA-F]{130}$/u.test(payload.signature) ||
      paymentPayload.resource?.url !== 'https://geomacro.live/api/v1/intelligence/query' ||
      paymentPayload.resource?.mimeType !== 'application/json' ||
      paymentPayload.extensions?.['payment-identifier']?.info?.id !== quote.quote_id)
    fail('BUYER_AUTHORIZATION_SCOPE_INVALID');
  // Verify server terms independently from the buyer's accepted object.
  const supported = await readCircleFacilitatorSupport({ fetchImpl });
  const kind = circleNativeExactKind(supported, quote.network, quote.asset_contract);
  const accepted = paymentPayload.accepted;
  const timeout = Math.min(60, Math.floor((Date.parse(quote.expires_at) - nowMs) / 1000));
  if (!accepted || !Number.isSafeInteger(accepted.maxTimeoutSeconds) ||
      accepted.maxTimeoutSeconds <= 0 || accepted.maxTimeoutSeconds > timeout)
    fail('BUYER_TIMEOUT_INVALID');
  const requirement = { scheme: 'exact', network: quote.network, amount: quote.amount_atomic,
    asset: kind.asset, payTo: quote.recipient, maxTimeoutSeconds: accepted.maxTimeoutSeconds,
    extra: kind.extra };
  if (!isDeepStrictEqual(accepted, requirement)) fail('BUYER_REQUIREMENT_MISMATCH');
  const body = JSON.stringify({ x402Version: 2, paymentPayload, paymentRequirements: requirement });
  const proof = await signCircleVerificationProof({ network: quote.network,
    payTo: quote.recipient, body, signer, nowMs });
  const result = await jsonRequest('/verify', { method: 'POST', body, headers: {
    'content-type': 'application/json', authorization: 'Bearer ' + apiKey.trim(),
    'Facilitator-Seller-Proof': proof,
  } }, fetchImpl);
  const valid = result?.isValid === true && typeof result.payer === 'string' &&
    result.payer.toLowerCase() === auth.from.toLowerCase();
  return Object.freeze({ schema: 'geomacro.circle-facilitator-verification.v1', valid,
    quote_id: quote.quote_id, network: quote.network,
    prepared_answer_sha256: quote.prepared_answer_sha256,
    provider_verification_only: true, settlement_verified: false,
    payment_authorized: false, execution_authorized: false });
}
