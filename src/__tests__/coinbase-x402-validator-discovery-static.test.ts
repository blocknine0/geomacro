import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  path.resolve('src/routes/api.x402.risk.ts'),
  'utf8',
);
const x402 = fs.readFileSync(path.resolve('src/lib/coinbase-x402.server.ts'), 'utf8');

describe('Coinbase x402 validator discovery ordering', () => {
  it('returns x402 discovery requirements for an unpaid schema-invalid probe', () => {
    const zodCatch = source.indexOf('if (error instanceof ZodError)');
    const unpaidDiscovery = source.indexOf(
      'if (!request.headers.get("payment-signature"))',
      zodCatch,
    );
    const paidValidationError = source.indexOf(
      'code: "INVALID_AGENT_REQUEST"',
      unpaidDiscovery,
    );

    expect(zodCatch).toBeGreaterThan(-1);
    expect(unpaidDiscovery).toBeGreaterThan(zodCatch);
    expect(paidValidationError).toBeGreaterThan(unpaidDiscovery);
    expect(
      source.slice(unpaidDiscovery, paidValidationError),
    ).toContain('return paymentRequiredResponse(request, config)');
  });

  it('keeps schema-invalid paid requests fail-closed before settlement', () => {
    const unpaidDiscovery = source.indexOf(
      'if (!request.headers.get("payment-signature"))',
    );
    const paidValidationError = source.indexOf(
      'code: "INVALID_AGENT_REQUEST"',
      unpaidDiscovery,
    );
    const paymentDecode = source.indexOf(
      'paymentPayload = decodeCoinbasePaymentHeader(paymentHeader)',
    );

    expect(paidValidationError).toBeGreaterThan(unpaidDiscovery);
    expect(paymentDecode).toBeGreaterThan(paidValidationError);
    expect(source.slice(paidValidationError, paymentDecode)).toContain('400');
  });

  it('advertises the Mainnet three-tier USDC contract and 47+ country scope', () => {
    expect(source).toContain('COINBASE_X402_MAINNET_NETWORK');
    expect(source).toContain('COINBASE_X402_POLYGON_MAINNET_NETWORK');
    expect(source).toContain('COINBASE_X402_ARC_MAINNET_NETWORK');
    expect(source).toContain('minimum_countries: 47');
    expect(source).toContain('output_contract:');
    expect(source).toContain('agent_decision:');
    expect(source).toContain('analyst_brief:');
    expect(source).toContain('price_usdc: config.environment === "production" ? null : config.priceUsdc');
    expect(source).toContain('production_endpoint: "https://geomacro.live/api/v1/intelligence/query"');
    expect(x402).toContain('BASIC: { priceUsdc: "0.15", amountAtomic: "150000" }');
    expect(x402).toContain('STANDARD: { priceUsdc: "0.20", amountAtomic: "200000" }');
    expect(x402).toContain('COMPLEX: { priceUsdc: "0.30", amountAtomic: "300000" }');
    expect(x402).toContain('0x95ba71d21c41bda8bba9533f96d25f793e4137b5');
  });

  it('keeps the legacy Risk Gate POST disabled for production', () => {
    const disabled = source.indexOf('code: "LEGACY_X402_PRODUCTION_DISABLED"');
    const productionGuard = source.indexOf('if (config.environment === "production")');
    const preflight = source.indexOf('proveLegacyDeliverable(body)');
    expect(productionGuard).toBeGreaterThan(-1);
    expect(disabled).toBeGreaterThan(productionGuard);
    expect(preflight).toBeGreaterThan(disabled);
    expect(source).toContain('return json({ ok: false, error: "X402_UNCONFIGURED" }, 503)');
  });

  it('returns a data-free 402 before running the Risk Gate preflight', () => {
    const unpaidChallenge = source.indexOf('if (!paymentHeader) return paymentRequiredResponse(request, config)');
    const verify = source.indexOf('verifyCoinbaseX402(paymentPayload, config)');
    const preflight = source.indexOf('proveLegacyDeliverable(body)');
    const settle = source.indexOf('settleCoinbaseX402(paymentPayload, config)');
    expect(unpaidChallenge).toBeGreaterThan(-1);
    expect(verify).toBeGreaterThan(unpaidChallenge);
    expect(preflight).toBeGreaterThan(verify);
    expect(settle).toBeGreaterThan(preflight);
    expect(x402.slice(x402.indexOf('export function coinbaseX402PaymentRequired'), x402.indexOf('function encodeUtf8Base64')))
      .not.toContain('risk_gate:');
  });
});
