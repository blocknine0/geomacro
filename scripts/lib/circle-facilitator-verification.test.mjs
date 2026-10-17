import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Wallet, verifyTypedData, keccak256, toUtf8Bytes } from 'ethers';
import { GEOMACRO_USDC_NATIVE_RAILS } from '../../src/lib/usdc-native-rail-identities.ts';
import { resolveGeomacroCapabilityPrice } from '../../src/lib/capability-pricing-catalog.ts';
import { capabilityQuoteHash } from '../../workers/commerce-ledger/src/capability-prequote.mjs';
import { circleNativeExactKind, readCircleFacilitatorSupport,
  signCircleVerificationProof, verifyCirclePreparedAuthorization } from './circle-facilitator-verification.mjs';

const nowMs = Date.parse('2026-10-18T00:01:00Z');
const seller = Wallet.createRandom(), buyer = Wallet.createRandom();
const bytes = JSON.stringify({ synthetic_no_funds: true });
const support = { x402Version: 2, kinds: Object.values(GEOMACRO_USDC_NATIVE_RAILS).map(r => ({
  x402Version: 2, scheme: 'exact', network: r.caip2, asset: r.asset, decimals: 6,
  extra: { name: r.id === 'base' ? 'USD Coin' : 'USDC', version: '2' },
})) };
async function fixture(rail) {
  const quote = { ...resolveGeomacroCapabilityPrice('structural_country_digest', 'standard'),
    quote_id: '', issued_at: '2026-10-18T00:00:00.000Z', expires_at: '2026-10-18T00:05:00.000Z',
    quote_window_seconds: 300, request_fingerprint_sha256: 'a'.repeat(64),
    prepared_answer_sha256: createHash('sha256').update(bytes).digest('hex'),
    network: rail.caip2, asset_contract: rail.asset.toLowerCase(), recipient: seller.address.toLowerCase(),
    availability: 'VERIFIED_DELIVERABLE', payment_rail: 'circle_gateway_x402', execution_authorized: false };
  quote.quote_id = await capabilityQuoteHash(quote);
  const kind = circleNativeExactKind(support, rail.caip2, rail.asset);
  const paymentPayload = { x402Version: 2,
    resource: { url: 'https://geomacro.live/api/v1/intelligence/query', mimeType: 'application/json' },
    accepted: { scheme: 'exact', network: rail.caip2, amount: '20000', asset: kind.asset,
      payTo: quote.recipient, maxTimeoutSeconds: 12, extra: kind.extra },
    payload: { signature: '0x' + '1'.repeat(130), authorization: {
      from: buyer.address, to: quote.recipient, value: '20000', validAfter: '0',
      validBefore: String(Date.parse(quote.expires_at) / 1000), nonce: '0x' + 'b'.repeat(64),
    } }, extensions: { 'payment-identifier': { info: { required: true, id: quote.quote_id } } } };
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.redirect, 'error');
    if (url.endsWith('/supported')) return Response.json(support);
    assert.equal(url, 'https://api.circle.com/v1/facilitator/x402/verify');
    const sent = JSON.parse(options.body);
    assert.deepEqual(sent.paymentPayload, paymentPayload);
    assert.deepEqual(sent.paymentRequirements, paymentPayload.accepted);
    assert.equal(options.headers.authorization, 'Bearer synthetic-test-key');
    const envelope = JSON.parse(Buffer.from(options.headers['Facilitator-Seller-Proof'], 'base64url'));
    assert.equal(envelope.network, rail.caip2);
    assert.equal(envelope.payTo, quote.recipient);
    assert.equal(envelope.expiresAt - envelope.issuedAt, 300);
    return Response.json({ isValid: true, payer: buyer.address });
  };
  return { input: { quote, customerBytes: bytes, paymentPayload, signer: seller,
    apiKey: 'synthetic-test-key', fetchImpl, nowMs }, calls };
}

for (const rail of Object.values(GEOMACRO_USDC_NATIVE_RAILS)) {
  test(`${rail.id}: 0.02 USDC verification binds prepared bytes, native rail, payer and seller`, async () => {
    const { input, calls } = await fixture(rail);
    const result = await verifyCirclePreparedAuthorization(input);
    assert.equal(result.valid, true);
    assert.equal(result.settlement_verified, false);
    assert.equal(result.payment_authorized, false);
    assert.equal(result.execution_authorized, false);
    assert.equal(calls.length, 2);
    assert.ok(calls.every(c => !c.url.includes('/settle')));
  });
}

test('seller EIP-712 signature recovers only for exact body, method, purpose and chain', async () => {
  const network = 'eip155:8453', payTo = seller.address;
  const body = JSON.stringify({ paymentRequirements: { network, payTo } });
  const header = await signCircleVerificationProof({ network, payTo, body, signer: seller, nowMs });
  const e = JSON.parse(Buffer.from(header, 'base64url'));
  const domain = { name: 'Circle Facilitator Seller Request', version: '1', chainId: 8453 };
  const types = { SellerRequest: [
    ['purpose','string'],['method','string'],['bodyHash','bytes32'],['network','string'],
    ['payTo','address'],['nonce','bytes32'],['issuedAt','uint64'],['expiresAt','uint64'],
  ].map(([name,type]) => ({ name, type })) };
  const message = { purpose: 'verify', method: 'POST', bodyHash: keccak256(toUtf8Bytes(body)),
    network, payTo, nonce: e.nonce, issuedAt: e.issuedAt, expiresAt: e.expiresAt };
  assert.equal(verifyTypedData(domain, types, message, e.signature), seller.address);
  for (const change of [{ purpose: 'settle' }, { method: 'GET' },
    { bodyHash: keccak256(toUtf8Bytes(body + ' ')) }, { network: 'eip155:137' }])
    assert.notEqual(verifyTypedData(domain, types, { ...message, ...change }, e.signature), seller.address);
  assert.notEqual(verifyTypedData({ ...domain, chainId: 137 }, types, message, e.signature), seller.address);
  await assert.rejects(signCircleVerificationProof({ network, payTo, body, signer: buyer, nowMs }));
});

test('tampered quote, bytes, amount, asset, recipient, native time and idempotency reject', async () => {
  const changes = [
    i => { i.quote.amount_atomic = '50000'; },
    i => { i.customerBytes += ' '; },
    i => { i.paymentPayload.payload.authorization.value = '50000'; },
    i => { i.paymentPayload.accepted.asset = GEOMACRO_USDC_NATIVE_RAILS.polygon.asset; },
    i => { i.paymentPayload.payload.authorization.to = buyer.address; },
    i => { i.paymentPayload.payload.authorization.validAfter = String(nowMs / 1000 + 1); },
    i => { i.paymentPayload.payload.authorization.validBefore = String(nowMs / 1000); },
    i => { i.paymentPayload.payload.authorization.validBefore = '9999999999999999999999999'; },
    i => { i.paymentPayload.extensions['payment-identifier'].info.id = 'different'; },
    i => { i.nowMs = Date.parse(i.quote.expires_at); },
    i => { i.paymentPayload.accepted.extra = { name: 'GatewayWalletBatched', version: '2' }; },
    i => { i.paymentPayload.accepted.maxTimeoutSeconds = 300; },
    i => { i.apiKey = 'secret\ninjected'; },
  ];
  for (const change of changes) {
    const { input, calls } = await fixture(GEOMACRO_USDC_NATIVE_RAILS.base);
    change(input);
    await assert.rejects(verifyCirclePreparedAuthorization(input));
    assert.ok(calls.every(c => !c.url.endsWith('/verify')));
  }
});

test('provider denial, payer mismatch, transport and malformed support cannot authorize', async () => {
  const { input } = await fixture(GEOMACRO_USDC_NATIVE_RAILS.base);
  for (const result of [{ isValid: false }, { isValid: true }, { isValid: true, payer: seller.address }]) {
    const response = await verifyCirclePreparedAuthorization({ ...input, fetchImpl: async url =>
      Response.json(url.endsWith('/supported') ? support : result) });
    assert.equal(response.valid, false);
    assert.equal(response.settlement_verified, false);
  }
  await assert.rejects(readCircleFacilitatorSupport({ fetchImpl: async () => { throw Error('secret'); } }),
    /TRANSPORT_UNAVAILABLE/);
  await assert.rejects(readCircleFacilitatorSupport({ fetchImpl: async () =>
    new Response('secret-provider-error', { status: 401 }) }), /HTTP_401/);
  await assert.rejects(readCircleFacilitatorSupport({ fetchImpl: async () => Response.json({ kinds: [] }) }));
  for (const wrong of ['0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', '0x'+'0'.repeat(40)])
    assert.throws(() => circleNativeExactKind(support, 'eip155:137', wrong));
  const duplicate = { ...support, kinds: [...support.kinds, support.kinds[0]] };
  assert.throws(() => circleNativeExactKind(duplicate, 'eip155:8453', support.kinds[0].asset));
});
